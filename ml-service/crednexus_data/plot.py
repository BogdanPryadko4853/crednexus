"""Portable v2 diagnostic figure, using bounded-size monthly reads."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('dataset',type=Path)
    args=parser.parse_args();root=args.dataset
    manifest=json.loads((root/'manifest.json').read_text())
    audit_path=Path(__file__).resolve().parents[1]/'docs'/'adequacy_v2_metrics.json'
    audit=json.loads(audit_path.read_text())
    if audit['source_sha256']!=manifest['source_sha256'] or audit['dataset_config']!=manifest['config']:
        raise ValueError('Run the adequacy audit for this dataset before plotting')
    scores=pd.read_parquet(root/'score_features',columns=['requested_amount','sales_mean_12'])
    fig,axes=plt.subplots(2,3,figsize=(17,9),layout='constrained')
    axes[0,0].hist(scores.sales_mean_12/1e6,bins=np.geomspace(.01,50,50),color='#2868a5')
    axes[0,0].set(xscale='log',title='Monthly sales: observed 12-month mean',xlabel='RUB million',ylabel='Eligible companies')
    sector=pd.DataFrame(audit['sector_profiles']).T.sort_values('dso_median')
    yy=np.arange(len(sector));axes[0,1].barh(yy-.18,sector.dso_median,height=.35,label='DSO proxy',color='#2868a5')
    axes[0,1].barh(yy+.18,sector.dpo_median,height=.35,label='DPO proxy',color='#d27a45')
    axes[0,1].set_yticks(yy,sector.index);axes[0,1].set(title='Different customer / supplier cash cycles',xlabel='Days, median at application');axes[0,1].legend(fontsize=8)
    metrics=audit['diagnostic_forecast']['results']['test']['cash_inflow']['by_horizon']
    for model,label,color in [('catboost','Diagnostic CatBoost','#2868a5'),('seasonal_naive','Seasonal baseline','#d27a45')]:
        axes[0,2].plot([1,2,3],[metrics[str(h)][model]['wape']*100 for h in [1,2,3]],marker='o',label=label,color=color)
    axes[0,2].set(title='Cash receipt forecast: sampled temporal test',xlabel='Forecast horizon, months',ylabel='WAPE, %',xticks=[1,2,3]);axes[0,2].legend(fontsize=8)
    path=sorted((root/'companies').glob('*.parquet'))[0]
    companies=pd.read_parquet(path);truth=pd.read_parquet(root/'audit/monthly_truth'/path.name)
    normal=pd.read_parquet(root/'monthly_observed'/path.name);bad=pd.read_parquet(root/'monthly_corrupted'/path.name)
    b2b=companies.loc[companies.sector.eq('wholesale'),'company_id'].iloc[0]
    a=truth[truth.company_id.eq(b2b)]
    axes[1,0].plot(a.month_idx,a.sales/1e6,label='Invoiced sales',color='#2868a5')
    axes[1,0].plot(a.month_idx,a.cash_inflow/1e6,label='Customer receipts',color='#38a17a')
    axes[1,0].set(title=f'Sales and collections differ: {b2b}',xlabel='Synthetic month',ylabel='RUB million');axes[1,0].legend(fontsize=8)
    closure_dates=truth.loc[truth.business_state.eq(3)].groupby('company_id').month_idx.min()
    candidates=closure_dates[closure_dates.between(30,80)]
    closed=candidates.index[0] if len(candidates) else closure_dates.index[0]
    a=truth[truth.company_id.eq(closed)];closed_at=int(a.loc[a.business_state.eq(3),'month_idx'].min())
    axes[1,1].plot(a.month_idx,a.sales/1e6,label='Sales',color='#2868a5')
    axes[1,1].plot(a.month_idx,a.cash_balance/1e6,label='Cash balance (stock)',color='#38a17a')
    axes[1,1].fill_between(a.month_idx,0,1,where=a.business_state.eq(1),
                          transform=axes[1,1].get_xaxis_transform(),color='#e6a43c',alpha=.12,label='Distressed')
    axes[1,1].axvspan(closed_at,a.month_idx.max(),color='#c95545',alpha=.12,label='Closed')
    axes[1,1].axvline(closed_at,color='#c95545',linestyle='--',linewidth=1)
    axes[1,1].set(title=f'Life cycle and closure: {closed}',xlabel='Synthetic month',ylabel='RUB million');axes[1,1].legend(fontsize=8)
    candidates=truth[((truth.corruption_mask.astype(int)&64)>0)&truth.cash_inflow.gt(1)]
    dirty=candidates.company_id.iloc[0]
    a=truth[truth.company_id.eq(dirty)];b=normal[normal.company_id.eq(dirty)];d=bad[bad.company_id.eq(dirty)]
    axes[1,2].plot(a.month_idx,a.cash_inflow/1e6,label='Truth',color='#2868a5')
    axes[1,2].scatter(b.month_idx,b.cash_inflow/1e6,s=7,label='Ordinary observations',color='#38a17a')
    axes[1,2].scatter(d.month_idx,d.cash_inflow/1e6,s=12,marker='x',label='Separate corrupted stress view',color='#a34b8b')
    axes[1,2].set(yscale='symlog',title=f'Economic truth vs export errors: {dirty}',xlabel='Synthetic month',ylabel='RUB million');axes[1,2].legend(fontsize=7)
    for ax in axes.flat:ax.grid(alpha=.18)
    fig.suptitle(f"CredNexus v2: {manifest['rows']['companies']:,} synthetic businesses — richer mechanisms; no empirical Russian calibration",fontsize=14)
    fig.savefig(root/'dataset_overview.png',dpi=160)
    detail,detail_axes=plt.subplots(2,1,figsize=(12,7),sharex=True,layout='constrained')
    a=truth[truth.company_id.eq(closed)]
    detail_axes[0].plot(a.month_idx,a.cash_balance/1e6,color='#38a17a',label='Cash balance at month end')
    detail_axes[0].plot(a.month_idx,a.sales/1e6,color='#2868a5',label='Invoiced sales')
    detail_axes[0].set(ylabel='RUB million',title=f'{closed}: cash balance is a stock, not monthly profit')
    for key,label,color in [('cash_inflow','Customer receipts','#2868a5'),('operating_cash_outflow','Operating payments','#d27a45'),('debt_payment','Debt payments','#a34b8b')]:
        detail_axes[1].plot(a.month_idx,a[key]/1e6,label=label,color=color)
    detail_axes[1].set(xlabel='Synthetic month',ylabel='RUB million / month')
    for ax in detail_axes:
        ax.axvspan(closed_at,a.month_idx.max(),color='#c95545',alpha=.12,label='Closed: settlement of old claims only')
        ax.axvline(closed_at,color='#c95545',linestyle='--',linewidth=1)
        ax.grid(alpha=.18);ax.legend(fontsize=8)
    detail.savefig(root/'lifecycle_detail.png',dpi=160)
    print(root/'dataset_overview.png')


if __name__=='__main__':main()
