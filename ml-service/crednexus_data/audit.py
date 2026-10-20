"""V2 economic audit and bounded CPU diagnostic models; no training/test data mutation."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from catboost import CatBoostClassifier, CatBoostRegressor
from .config import MEASURES


def quantiles(values):
    values=np.asarray(values,dtype=float);values=values[np.isfinite(values)]
    return {str(p):float(np.quantile(values,p)) for p in (0,.01,.1,.5,.9,.99,1)}


def ratio(a,b):
    return np.divide(a,b,out=np.full(np.broadcast_shapes(np.shape(a),np.shape(b)),np.nan),where=b>0)


def classifier_metrics(y,p):
    return {'rows':len(y),'positives':int(y.sum()),'observed_rate':float(y.mean()),'predicted_rate':float(p.mean()),
            'roc_auc':float(roc_auc_score(y,p)),'average_precision':float(average_precision_score(y,p)),
            'brier':float(brier_score_loss(y,p))}


def diagnostic_scoring(root,manifest):
    x=pd.read_parquet(root/'score_features');y=pd.read_parquet(root/'score_labels')
    assert x.application_id.equals(y.application_id)
    corrupted=pd.read_parquet(root/'stress/score_features_corrupted')
    assert x.application_id.equals(corrupted.application_id)
    allowed=manifest['scoring_feature_columns'];results={}
    for target in ('default_next12m','default_90dpd_next12m'):
        models={}
        for name,columns in [('coverage_and_dpd',['cash_flow_coverage','bureau_dpd_current']),('all_features',allowed)]:
            train=x.split=='train';cats=[c for c in columns if x[c].dtype==object]
            model=CatBoostClassifier(iterations=180,depth=5,learning_rate=.08,loss_function='Logloss',
                                    random_seed=20261021,thread_count=4,verbose=False,allow_writing_files=False)
            model.fit(x.loc[train,columns],y.loc[train,target],cat_features=cats)
            output={}
            for split in ('validation','test','stress_test'):
                mask=x.split==split
                output[split]=classifier_metrics(y.loc[mask,target].to_numpy(),model.predict_proba(x.loc[mask,columns])[:,1])
            if name=='all_features':
                mask=x.split=='test'
                output['corrupted_test']=classifier_metrics(y.loc[mask,target].to_numpy(),model.predict_proba(corrupted.loc[mask,columns])[:,1])
                importance=sorted(zip(columns,model.feature_importances_.tolist()),key=lambda pair:-pair[1])
                output['feature_importance']=dict(importance[:12])
            models[name]=output
        results[target]=models
    return results


def forecast_metrics(truth,pred):
    return {'rows':len(truth),'mae':float(np.abs(truth-pred).mean()),
            'wape':float(np.abs(truth-pred).sum()/max(truth.sum(),1))}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset',type=Path)
    parser.add_argument('--output',type=Path,default=Path('docs/adequacy_v2_metrics.json'))
    args=parser.parse_args();root=args.dataset
    manifest=json.loads((root/'manifest.json').read_text());m=manifest['config']['months']
    rng=np.random.default_rng(20261021)
    score=pd.read_parquet(root/'score_features');labels=pd.read_parquet(root/'score_labels')
    quantile_frames=[];years=[];samples=[];target_samples=[];base_samples=[]
    for path in sorted((root/'companies').glob('*.parquet')):
        c=pd.read_parquet(path);n=len(c)
        t=pd.read_parquet(root/'audit/monthly_truth'/path.name)
        observed=pd.read_parquet(root/'monthly_observed'/path.name)
        a={key:t[key].to_numpy().reshape(n,m) for key in t.select_dtypes(include='number')}
        obs={key:observed[key].to_numpy().reshape(n,m) for key in MEASURES}
        lookup={cid:i for i,cid in enumerate(c.company_id)}
        s=score[score.company_id.isin(lookup)].copy();rows=s.company_id.map(lookup).to_numpy();origin=s.as_of_month_idx.to_numpy()
        window=origin[:,None]-np.arange(12)
        valid=window>=c.birth_month_idx.to_numpy()[rows,None]
        def mean(key):return np.where(valid,a[key][rows[:,None],window],0).sum(axis=1)/np.maximum(valid.sum(axis=1),1)
        sales=mean('sales');expense=mean('operating_expense')
        frame=pd.DataFrame({'application_id':s.application_id,'sector':s.sector,'monthly_sales':sales,
                   'dso_proxy':ratio(a['accounts_receivable'][rows,origin]*30,sales),
                   'dpo_proxy':ratio(a['accounts_payable'][rows,origin]*30,mean('purchases')),
                   'cash_months_expense':ratio(a['cash_balance'][rows,origin],expense),
                   'operating_margin':ratio(sales-expense,sales),
                   'normal_inflow_mean_ratio':ratio(s.cash_inflow_mean_12.to_numpy(),mean('cash_inflow'))})
        quantile_frames.append(frame)
        for year in range(m//12):
            sl=slice(year*12,year*12+12);valid_year=(a['operating'][:,sl]>0).all(axis=1)
            sales_y=a['sales'][:,sl].sum(axis=1);expense_y=a['operating_expense'][:,sl].sum(axis=1)
            years.append(pd.DataFrame({'sales':sales_y[valid_year],'operating_margin':ratio(sales_y-expense_y,sales_y)[valid_year]}))
        f=pd.read_parquet(root/'forecast_features'/path.name)
        fl=pd.read_parquet(root/'forecast_labels'/path.name)
        for split in ('train','validation','test','stress_test'):
            positions=np.flatnonzero(f.company_split.eq(split).to_numpy())
            chosen=rng.choice(positions,min(len(positions),300 if split=='train' else 120),replace=False)
            part=f.iloc[chosen].copy();target=fl.iloc[chosen].copy()
            assert part.sample_id.equals(target.sample_id)
            rr=part.company_id.map(lookup).to_numpy();tt=part.target_month_idx.to_numpy()
            seasonal=np.column_stack([obs[key][rr,tt-12] for key in ('cash_inflow','operating_cash_outflow')])
            fallback=part[['cash_inflow_mean_3','operating_cash_outflow_mean_3']].to_numpy()
            seasonal=np.where(np.isfinite(seasonal),seasonal,fallback)
            # Short histories occasionally miss both; a declared zero fallback, not future filling.
            seasonal=np.nan_to_num(seasonal,nan=0.)
            samples.append(part);target_samples.append(target);base_samples.append(seasonal)
    origin_profile=pd.concat(quantile_frames,ignore_index=True)
    annual=pd.concat(years,ignore_index=True)
    joined=origin_profile.merge(labels[['application_id','default_next12m']],on='application_id',validate='one_to_one')
    sector=joined.groupby('sector').agg(companies=('application_id','size'),dso_median=('dso_proxy','median'),
                  dpo_median=('dpo_proxy','median'),cash_months_median=('cash_months_expense','median'),
                  operating_margin_median=('operating_margin','median'),default_rate=('default_next12m','mean')).to_dict('index')
    report={'version':2,'dataset_config':manifest['config'],'source_sha256':manifest['source_sha256'],
            'target_note':'Composite adverse credit event = 90DPD or distressed restructuring or uncovered-debt closure; 90DPD retained separately.',
            'origin_quantiles':{c:quantiles(origin_profile[c]) for c in origin_profile.select_dtypes(include='number')},
            'sector_profiles':sector,'annual_sales_quantiles':quantiles(annual.sales),
            'annual_negative_operating_margin_share':float((annual.operating_margin<0).mean()),
            'annual_sales_over_800m_share':float((annual.sales>800e6).mean()),
            'historical_dpd_positive_share':float((score.bureau_dpd_max_12>0).mean()),
            'cash_coverage_quantiles':quantiles(score.cash_flow_coverage),
            'loan_amount_quantiles':quantiles(score.requested_amount),
            'default_by_purpose':score[['application_id','purpose']].merge(labels[['application_id','default_next12m']],on='application_id').groupby('purpose').default_next12m.agg(['size','mean']).to_dict('index')}
    print('Economic profiles complete; diagnostic scoring',flush=True)
    report['diagnostic_scoring']=diagnostic_scoring(root,manifest)
    print('Scoring complete; sampled forecast diagnostic',flush=True)
    f=pd.concat(samples,ignore_index=True);target=pd.concat(target_samples,ignore_index=True);baseline=np.concatenate(base_samples)
    x=f[manifest['forecast_feature_columns']]
    y=target[['cash_inflow_target','operating_cash_outflow_target']].to_numpy()
    train=f.company_split.eq('train').to_numpy()
    model=CatBoostRegressor(iterations=160,depth=6,learning_rate=.06,loss_function='MultiRMSE',
                           random_seed=20261021,thread_count=4,verbose=False,allow_writing_files=False)
    # Keep optimisation numerically well-scaled; stored targets remain in RUB.
    model.fit(x[train],y[train]/1e6,cat_features=['sector'])
    output={}
    for split in ('validation','test','stress_test'):
        mask=f.company_split.eq(split).to_numpy();prediction=np.maximum(model.predict(x[mask])*1e6,0)
        forecasts={}
        for j,key in enumerate(('cash_inflow','operating_cash_outflow')):
            forecast={'catboost':forecast_metrics(y[mask,j],prediction[:,j]),'seasonal_naive':forecast_metrics(y[mask,j],baseline[mask,j]),'by_horizon':{}}
            for h in (1,2,3):
                hm=f.loc[mask,'horizon'].to_numpy()==h
                forecast['by_horizon'][h]={'catboost':forecast_metrics(y[mask,j][hm],prediction[:,j][hm]),'seasonal_naive':forecast_metrics(y[mask,j][hm],baseline[mask,j][hm])}
            forecasts[key]=forecast
        output[split]=forecasts
    report['diagnostic_forecast']={'note':'Fixed diagnostic model, sampled rows per shard. Baseline uses known same month last year; fallback mean3, then zero. Not population-weighted deployment validation.',
                                   'train_rows':int(train.sum()),'results':output}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print(args.output,flush=True)


if __name__=='__main__':main()
