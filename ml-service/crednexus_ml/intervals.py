"""Held-out validation residual intervals, with measured future/OOD coverage.

These are empirical marginal intervals: company dependence and temporal shift
prevent claiming a finite-sample coverage guarantee on future companies.
"""
import argparse,json
from pathlib import Path
import numpy as np
import pandas as pd
from .common import company_fold,json_dump
from .inference import Predictor
from .train import scale_for


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--artifacts',type=Path,default=Path('artifacts/benchmark_v1'));a=p.parse_args()
    x=pd.read_parquet(a.artifacts/'panel/forecast_features.parquet');labels=pd.read_parquet(a.artifacts/'panel/forecast_labels.parquet')
    cal=x.company_split.eq('validation').to_numpy()&(company_fold(x.company_id)>=7);summary={}
    for target in ['cash_inflow_target','operating_cash_outflow_target']:
        root=a.artifacts/target;model=Predictor(a.artifacts,target)
        truth=labels[target].to_numpy();pred=model.predict(x.loc[cal]);scale=scale_for(x,target,'relative')
        residual=np.abs(truth[cal]-pred)/scale[cal]
        quantiles={}
        for h in [1,2,3]:
            r=residual[x.loc[cal,'horizon'].eq(h)];level=min(1,np.ceil((len(r)+1)*.9)/len(r))
            quantiles[str(h)]=float(np.quantile(r,level,method='higher'))
        reg=json.loads((root/'registry.json').read_text());reg['intervals']={'nominal_coverage':.9,'scale':'relative',
            'normalized_absolute_residual_quantiles':quantiles,'calibration_rows':int(cal.sum()),
            'method':'Held-out validation companies, empirical marginal intervals by horizon; no temporal coverage guarantee.'}
        json_dump(root/'registry.json',reg)
        summary[target]={}
        for split in ['validation','test','stress_test']:
            mask=x.company_split.eq(split).to_numpy()
            if split=='validation':mask=cal
            xx=x.loc[mask];point=model.predict(xx);half=scale[mask]*xx.horizon.astype(str).map(quantiles).to_numpy()
            lo=np.maximum(point-half,0);hi=point+half
            summary[target][split]={'rows':len(xx),'coverage':float(((truth[mask]>=lo)&(truth[mask]<=hi)).mean()),
                'mean_width_rub':float(np.mean(hi-lo))}
    json_dump(a.artifacts/'interval_metrics.json',summary);print(summary)


if __name__=='__main__':main()
