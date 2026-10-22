"""CPU-only production loader; no CatBoost, LightGBM, XGBoost or torch imports."""
from pathlib import Path
import json
import numpy as np
import pandas as pd
import onnxruntime as ort
from .common import score_features,forecast_features,scale_for
from .runtime import resolve_runtime


def matrix(frame,schema):
    missing=set(schema['columns'])-set(frame)
    if missing:raise ValueError(f'Missing model features: {sorted(missing)}')
    out=np.empty((len(frame),len(schema['columns'])),dtype=np.float32)
    for j,c in enumerate(schema['columns']):
        if c in schema['categories']:
            values=frame[c].fillna('__MISSING__').astype(str)
            out[:,j]=pd.Categorical(values,categories=schema['categories'][c]).codes
        else:out[:,j]=pd.to_numeric(frame[c],errors='raise').replace([np.inf,-np.inf],np.nan).to_numpy(dtype=np.float32)
    return out


class OnnxPredictor:
    def __init__(self,root,target,threads=4,device=None):
        root=Path(root)/target
        self.schema=json.loads((root/'schema.json').read_text());self.registry=json.loads((root/'registry.json').read_text())
        self.classification=self.registry['task_type']=='classification'
        self.runtime=resolve_runtime(device)
        options=ort.SessionOptions();options.intra_op_num_threads=threads;options.inter_op_num_threads=1
        self.session=ort.InferenceSession(str(root/'model.onnx'),options,providers=[self.runtime.provider])
    def predict(self,frame):
        x=score_features(frame) if self.classification else forecast_features(frame)
        return self.session.run(['prediction'],{'features':matrix(x,self.schema)})[0].ravel()
    def predict_interval(self,frame):
        if self.classification:raise ValueError('Intervals apply to cash-flow forecasts')
        info=self.registry.get('intervals')
        if not info:raise ValueError('No calibrated forecast intervals in registry')
        q=frame.horizon.map({int(h):v for h,v in info['normalized_absolute_residual_quantiles'].items()})
        if q.isna().any():raise ValueError('Only horizons 1, 2, 3 are supported')
        point=self.predict(frame);half=scale_for(frame,self.registry['target'],info['scale'])*q.to_numpy()
        return np.column_stack([np.maximum(point-half,0),point,point+half])
