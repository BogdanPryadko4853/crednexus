"""Replay held-out predictions through the deployment loader and benchmark CPU."""
import argparse,gc,json,time,resource
from pathlib import Path
import numpy as np
import pandas as pd
from .common import json_dump,latency,load_native,predict_native,prepare
from .data import load_scoring
from .inference import Predictor
from .train import scale_for


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('dataset',type=Path)
    p.add_argument('--artifacts',type=Path,default=Path('artifacts/benchmark_v1'));a=p.parse_args()
    registry=json.loads((a.artifacts/'registry.json').read_text());report={}
    sx,_=load_scoring(a.dataset)
    fx=pd.read_parquet(a.artifacts/'panel/forecast_features.parquet') if (a.artifacts/'panel/panel.json').exists() else None
    for target in registry:
        classification=target.startswith('default');root=a.artifacts/target
        start=time.perf_counter();model=Predictor(a.artifacts,target);load_seconds=time.perf_counter()-start
        x=(sx.loc[sx.split.eq('test')] if classification else fx.loc[fx.company_split.eq('test')]).iloc[:1024].copy()
        key='application_id' if classification else 'sample_id'
        reference=pd.read_parquet(root/'test_predictions.parquet').set_index('id').loc[x[key]]
        raw=model.predict(x,calibrate=False);chosen=model.registry['selected_candidate']
        np.testing.assert_allclose(raw,reference[chosen],rtol=1e-6,atol=1e-6)
        family_errors={};objective_errors={};metrics=json.loads((root/'metrics.json').read_text())
        for name,info in model.registry['models'].items():
            native=load_native(name,root/name/info['path'],classification)
            pred=predict_native(native,name,prepare(x,model.schema,name),classification)
            if not classification:pred=np.maximum(pred*scale_for(x,target,info['normalization']),0)
            np.testing.assert_allclose(pred,reference[name],rtol=1e-6,atol=1e-6)
            metric='average_precision' if classification else 'wape'
            replay_objective=metrics[name]['validation_selection'][metric]
            np.testing.assert_allclose(replay_objective,info['validation_objective'],rtol=1e-6,atol=1e-8)
            objective_errors[name]=abs(replay_objective-info['validation_objective'])
            family_errors[name]=float(np.max(np.abs(pred-reference[name])));del native
        pred=model.predict(x);assert np.isfinite(pred).all()
        assert ((pred>=0)&(pred<=1)).all() if classification else (pred>=0).all()
        if not classification and model.registry.get('intervals'):
            intervals=model.predict_interval(x.iloc[:32])
            assert intervals.shape==(min(32,len(x)),3)
            assert np.isfinite(intervals).all() and (intervals[:,0]>=0).all()
            assert (intervals[:,0]<=intervals[:,1]).all() and (intervals[:,1]<=intervals[:,2]).all()
            np.testing.assert_allclose(intervals[:,1],pred[:32],rtol=1e-6)
        report[target]={'selected_candidate':chosen,'load_seconds':load_seconds,**latency(model.predict,x),
            'roundtrip_rows':len(x),'family_max_abs_errors':family_errors,
            'saved_vs_fitted_validation_objective_errors':objective_errors,
            'selected_weights_megabytes':sum((root/name/info['path']).stat().st_size for (name,info),w in zip(model.registry['models'].items(),model.registry['weights']) if w>0)/1e6}
        print(target,report[target],flush=True);del model;gc.collect()
    report['process_max_rss_megabytes']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
    json_dump(a.artifacts/'inference_verification.json',report)


if __name__=='__main__':main()
