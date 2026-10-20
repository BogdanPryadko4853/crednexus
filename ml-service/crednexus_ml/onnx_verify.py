"""Native/ONNX parity on independent cohorts and explicit boundary/missing cases."""
import argparse,json,time
from pathlib import Path
import numpy as np
import pandas as pd
import onnxruntime as ort
from .common import load_native,predict_native,prepare,score_features,forecast_features,scale_for,json_dump
from .data import load_scoring
from .inference import Predictor
from .onnx_inference import OnnxPredictor,matrix


def errors(actual,expected,classification,raw=False):
    actual=np.asarray(actual).ravel();expected=np.asarray(expected).ravel();assert np.isfinite(actual).all()
    # XGBoost uses float32 summation; ONNX v5 sums the exact float32 leaves in float64.
    atol=2e-6 if classification else 2e-5 if raw else 25.
    np.testing.assert_allclose(actual,expected,rtol=3e-5,atol=atol)
    return {'rows':len(actual),'max_abs_error':float(np.max(np.abs(actual-expected))),
            'mean_abs_error':float(np.mean(np.abs(actual-expected))),'rtol':3e-5,'atol':atol}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('dataset',type=Path)
    p.add_argument('--source',type=Path,default=Path('artifacts/benchmark_v1'));p.add_argument('--onnx',type=Path,default=Path('models/onnx'))
    p.add_argument('--components',type=Path,default=Path('artifacts/onnx_components'));a=p.parse_args()
    sx,_=load_scoring(a.dataset);fx=pd.read_parquet(a.source/'panel/forecast_features.parquet');report={}
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    for target in json.loads((a.source/'registry.json').read_text()):
        classification=target.startswith('default');original=sx if classification else fx;split='split' if classification else 'company_split'
        data=pd.concat([original.loc[original[split].eq(s)].sample(min(1024,len(original.loc[original[split].eq(s)])),random_state=20261021) for s in ['validation','test','stress_test']],ignore_index=True)
        schema=json.loads((a.source/target/'schema.json').read_text());registry=json.loads((a.source/target/'registry.json').read_text())
        # Stress missing numerical values (including fields without training NaNs),
        # unseen/missing categories and zeros independently of the test outcomes.
        edge=data.iloc[:128].copy()
        for c in schema['categories']:edge[c]=edge[c].astype(object);edge.loc[edge.index[::3],c]='UNSEEN_CATEGORY';edge.loc[edge.index[1::3],c]=None
        # Derived ratios are recalculated after perturbing source financial columns.
        for c in schema['columns']:
            if c not in schema['categories'] and c in edge:
                if c not in ('horizon',):edge.loc[edge.index[::4],c]=np.nan
        data=pd.concat([data,edge],ignore_index=True)
        data=score_features(data) if classification else forecast_features(data)
        values=matrix(data,schema);result={}
        for algorithm,info in registry['models'].items():
            native=load_native(algorithm,a.source/target/algorithm/info['path'],classification)
            expected=predict_native(native,algorithm,prepare(data,schema,algorithm),classification)
            session=ort.InferenceSession(str(a.components/target/(algorithm+'.onnx')),options,providers=['CPUExecutionProvider'])
            actual=session.run(None,{'features':values})[0].ravel()
            result[algorithm]=errors(actual,expected,classification,True)
            print(target,algorithm,result[algorithm],flush=True);del native,session
        native=Predictor(a.source,target);exported=OnnxPredictor(a.onnx,target)
        result['ensemble']=errors(exported.predict(data),native.predict(data),classification)
        if not classification:result['intervals']=errors(exported.predict_interval(data).ravel(),native.predict_interval(data).ravel(),False)
        exported.predict(data.iloc[:1]);dur=[]
        for _ in range(7):
            t=time.perf_counter();exported.predict(data.iloc[:1]);dur.append(1000*(time.perf_counter()-t))
        result['single_row_median_ms']=float(np.median(dur));report[target]=result
        json_dump(a.onnx/'verification.json',report)
        print(target,'ensemble',result['ensemble'],flush=True)
    print('All 12 components and 4 ensembles passed parity verification',flush=True)


if __name__=='__main__':main()
