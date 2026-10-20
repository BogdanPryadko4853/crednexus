"""Validate v2 cash, invoice, inventory, labels, life cycle and prospective splits."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from .config import MEASURES, cohorts
from .generate import history_features, source_fingerprint


def validate(root):
    root=Path(root)
    manifest=json.loads((root/'manifest.json').read_text())
    m=manifest['config']['months']
    counts={k:0 for k in manifest['rows']}
    counts['macro']=len(pd.read_parquet(root/'macro'))
    seen=set()
    sector_counts={}
    totals={'defaults':0,'defaults_90dpd':0,'eligible':0,'excluded':0,'operating_months':0,
            'closed_company_months':0,'normal_quality_months':0,'corrupted_months':0,
            'negative_operating_margin_company_years':0,'full_company_years':0,
            'history_has_dpd':0,'normal_inflow_mean_large_error':0}
    scoring_periods={}
    forecast_periods={}
    months_by_horizon={h:set() for h in (1,2,3)}
    score_quantiles=[]
    for path in sorted((root/'companies').glob('*.parquet')):
        frames={table:pd.read_parquet(root/table/path.name) for table in counts if table!='macro'}
        for table,frame in frames.items(): counts[table]+=len(frame)
        c=frames['companies'];n=len(c)
        assert c.company_id.is_unique and not(set(c.company_id)&seen)
        seen.update(c.company_id)
        for sector,count in c.sector.value_counts().items():sector_counts[sector]=sector_counts.get(sector,0)+int(count)
        t=frames['audit/monthly_truth'];o=frames['monthly_observed'];clean=frames['monthly_clean'];bad=frames['monthly_corrupted']
        s=frames['score_features'];l=frames['score_labels'];f=frames['forecast_features'];fl=frames['forecast_labels'];outcome=frames['audit/credit_outcomes']
        assert len(t)==n*m
        for view in (o,clean,bad):
            assert len(view)==n*m
            np.testing.assert_array_equal(view.company_id,t.company_id)
            np.testing.assert_array_equal(view.month_idx,t.month_idx)
        a={key:t[key].to_numpy().reshape(n,m) for key in t.select_dtypes(include='number')}
        for key in a:
            assert np.isfinite(a[key]).all(),key
            assert (a[key]>=-1e-6).all(),key
        identity=t.opening_balance+t.cash_inflow+t.loan_disbursement+t.background_financing+t.owner_injection+t.asset_sale_inflow-t.operating_cash_outflow-t.debt_payment-t.investment_outflow-t.owner_draw
        np.testing.assert_allclose(t.cash_balance,identity,rtol=1e-10,atol=2e-6)
        np.testing.assert_allclose(t.inventory,t.opening_inventory+t.purchases-t.cost_of_sales-t.inventory_disposals,rtol=1e-10,atol=2e-6)
        for current,previous in [('opening_balance','cash_balance'),('opening_inventory','inventory')]:
            mask=np.arange(1,m)[None,:]!=c.birth_month_idx.to_numpy()[:,None]
            np.testing.assert_allclose(a[current][:,1:][mask],a[previous][:,:-1][mask],atol=2e-6)
        np.testing.assert_allclose(np.diff(a['accounts_receivable']),a['sales'][:,1:]-a['cash_inflow'][:,1:]-a['receivable_writeoff'][:,1:],atol=2e-6)
        # purchases create supplier liabilities; expense includes cost of goods sold, not purchases.
        new_payables=a['purchases']+a['operating_expense']-a['cost_of_sales']
        np.testing.assert_allclose(np.diff(a['accounts_payable']),new_payables[:,1:]-a['operating_cash_outflow'][:,1:],atol=2e-6)
        states=a['business_state']
        assert np.isin(states,[0,1,2,3,4]).all()
        # A firm may start and exit within one monthly bin; 4->3 is valid only at birth.
        immediate_exit=(states[:,:-1]==4)&(states[:,1:]==3)
        assert (~immediate_exit | (np.arange(1,m)[None,:]==c.birth_month_idx.to_numpy()[:,None])).all()
        assert ((states[:,:-1]!=3)|(states[:,1:]==3)).all(),'closed must be absorbing'
        assert ((states!=3)|(a['sales']==0)).all()
        assert not ((states<3)&(a['dpd']>390)).any(),'no indefinite active 1y+ DPD'
        exists=np.arange(m)[None,:]>=c.birth_month_idx.to_numpy()[:,None]
        for bit,key in enumerate(MEASURES):
            np.testing.assert_allclose(clean[key].to_numpy(),np.where(exists,a[key],np.nan).ravel(),equal_nan=True)
            normal_unchanged=exists.ravel()&((t.quality_error_mask.to_numpy()&((1<<bit)|(1<<(bit+5))))==0)
            np.testing.assert_array_equal(o.loc[normal_unchanged,key],clean.loc[normal_unchanged,key])
            corrupt_unchanged=(t.corruption_mask.to_numpy()&((1<<(bit+5))|(1024 if key=='cash_inflow' else 0)))==0
            np.testing.assert_allclose(bad.loc[corrupt_unchanged,key],o.loc[corrupt_unchanged,key],equal_nan=True)
        lookup={cid:i for i,cid in enumerate(c.company_id)}
        for frame,col in [(s,'split'),(l,'split'),(f,'company_split')]:
            np.testing.assert_array_equal(frame[col],frame.company_id.map(c.set_index('company_id').split))
        obs={k:o[k].to_numpy().reshape(n,m) for k in MEASURES}
        sr=s.company_id.map(lookup).to_numpy();so=s.as_of_month_idx.to_numpy()
        for key,values in history_features(obs,sr,so).items():np.testing.assert_allclose(s[key],values,equal_nan=True)
        np.testing.assert_array_equal(s.application_id,l.application_id)
        np.testing.assert_array_equal(s.as_of_month_idx,l.as_of_month_idx)
        np.testing.assert_array_equal(l.label_end_month_idx,so+12)
        assert (a['dpd'][sr,so]<90).all() and (states[sr,so]<2).all()
        future=so[:,None]+np.arange(1,13)
        target90=(a['dpd'][sr[:,None],future]>=90).any(axis=1)
        restructure=(a['distressed_restructure'][sr[:,None],future]>0).any(axis=1)
        closure=(a['closure_with_debt'][sr[:,None],future]>0).any(axis=1)
        np.testing.assert_array_equal(l.default_90dpd_next12m,target90)
        np.testing.assert_array_equal(l.distressed_restructure_next12m,restructure)
        np.testing.assert_array_equal(l.closure_with_debt_next12m,closure)
        np.testing.assert_array_equal(l.default_next12m,target90|restructure|closure)
        assert outcome.eligible_at_origin.eq(outcome.funded).all()
        for split,group in l.groupby('split'):
            stat=scoring_periods.setdefault(split,{'rows':0,'defaults':0,'defaults90':0,'min_origin':m,'max_label_end':0})
            stat['rows']+=len(group);stat['defaults']+=int(group.default_next12m.sum());stat['defaults90']+=int(group.default_90dpd_next12m.sum())
            stat['min_origin']=min(stat['min_origin'],int(group.as_of_month_idx.min()));stat['max_label_end']=max(stat['max_label_end'],int(group.label_end_month_idx.max()))
            lo,hi=cohorts(m)[split];assert group.as_of_month_idx.between(lo,hi).all()
        assert f.sample_id.is_unique and fl.sample_id.is_unique
        np.testing.assert_array_equal(f.sample_id,fl.sample_id)
        fr=f.company_id.map(lookup).to_numpy();fo=f.as_of_month_idx.to_numpy();ft=f.target_month_idx.to_numpy()
        assert (states[fr,fo]<3).all()
        np.testing.assert_array_equal(ft,fo+f.horizon.to_numpy())
        for key,values in history_features(obs,fr,fo).items():np.testing.assert_allclose(f[key],values,rtol=2e-7,atol=1e-5,equal_nan=True)
        np.testing.assert_array_equal(fl.cash_inflow_target,a['cash_inflow'][fr,ft])
        np.testing.assert_array_equal(fl.operating_cash_outflow_target,a['operating_cash_outflow'][fr,ft])
        np.testing.assert_allclose(fl.operating_net_cash_flow_target,fl.cash_inflow_target-fl.operating_cash_outflow_target)
        for period,group in f.groupby('time_split'):
            stat=forecast_periods.setdefault(period,{'rows':0,'min_origin':m,'max_target':0})
            stat['rows']+=len(group);stat['min_origin']=min(stat['min_origin'],int(group.as_of_month_idx.min()));stat['max_target']=max(stat['max_target'],int(group.target_month_idx.max()))
        for horizon,group in f.groupby('horizon'):months_by_horizon[int(horizon)].update(group.target_month_of_year.unique().tolist())
        for year in range(m//12):
            sl=slice(year*12,year*12+12)
            valid=(a['operating'][:,sl]>0).all(axis=1)
            totals['full_company_years']+=int(valid.sum())
            totals['negative_operating_margin_company_years']+=int(((a['sales'][:,sl].sum(axis=1)<a['operating_expense'][:,sl].sum(axis=1))&valid).sum())
        totals['defaults']+=int(l.default_next12m.sum());totals['defaults_90dpd']+=int(l.default_90dpd_next12m.sum());totals['eligible']+=len(s);totals['excluded']+=n-len(s)
        totals['operating_months']+=int(a['operating'].sum());totals['closed_company_months']+=int((states==3).sum())
        totals['normal_quality_months']+=int((t.quality_error_mask>0).sum());totals['corrupted_months']+=int((t.corruption_mask>0).sum())
        totals['history_has_dpd']+=int((s.bureau_dpd_max_12>0).sum())
        window=so[:,None]-np.arange(12)
        valid=window>=c.birth_month_idx.to_numpy()[sr,None]
        inflow=np.where(valid,a['cash_inflow'][sr[:,None],window],np.nan)
        mean=np.nansum(inflow,axis=1)/np.maximum(valid.sum(axis=1),1)
        ratio=s.cash_inflow_mean_12.to_numpy()/np.maximum(mean,1)
        totals['normal_inflow_mean_large_error']+=int(((ratio>1.2)|(ratio<.8)).sum())
        score_quantiles.append(s[['requested_amount','cash_flow_coverage','accounts_receivable','accounts_payable','overdue_payables','inventory']])
    assert counts==manifest['rows']
    if counts['companies']>=1000:
        assert all(months==set(range(1,13)) for months in months_by_horizon.values())
    for first,second in [('train','validation'),('validation','test')]:
        if first in scoring_periods and second in scoring_periods:
            assert scoring_periods[first]['max_label_end']<=scoring_periods[second]['min_origin']
        if first in forecast_periods and second in forecast_periods:
            assert forecast_periods[first]['max_target']<=forecast_periods[second]['min_origin']
    for stat in scoring_periods.values():stat['default_rate']=stat['defaults']/max(stat['rows'],1);stat['default90_rate']=stat['defaults90']/max(stat['rows'],1)
    forbidden={'company_id','application_id','sample_id','split','company_split','time_split','world','initial_regime','default_next12m','default_90dpd_next12m'}
    assert not forbidden.intersection(manifest['scoring_feature_columns'])
    assert not forbidden.intersection(manifest['forecast_feature_columns'])
    assert manifest['source_sha256']==source_fingerprint()
    report={'status':'passed','checks':['cash identity','inventory identity','balance continuity','receivables identity','payables identity',
       'finite nonnegative truth','absorbing closure','no indefinite zombie operation','clean/observed/corrupted separation',
       'company split isolation','as-of scoring features','as-of forecast features','composite and 90DPD labels','mature scoring temporal cohorts',
       'purged forecast temporal cohorts','all calendar months per horizon','feature allowlists','source fingerprints','row counts'],
       'rows':counts,'summary':totals,'default_by_split':scoring_periods,'forecast_by_period':forecast_periods,
       'months_by_horizon':{h:sorted(v) for h,v in months_by_horizon.items()},'sector_counts':sector_counts,
       'scoring_quantiles':pd.concat(score_quantiles).quantile([0,.01,.1,.5,.9,.99,1]).to_dict()}
    (root/'validation_report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({k:report[k] for k in ('status','summary','default_by_split','forecast_by_period')},indent=2))
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('dataset',type=Path)
    validate(parser.parse_args().dataset)
