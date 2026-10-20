"""Persistent CPU predictors; input features must be known at the forecast origin."""
from pathlib import Path
import json
import numpy as np
from scipy.special import expit,logit
from .common import load_native,predict_native,prepare,score_features,forecast_features,scale_for


class Predictor:
    def __init__(self,root,target,threads=4):
        self.root=Path(root)/target
        self.registry=json.loads((self.root/'registry.json').read_text())
        self.schema=json.loads((self.root/'schema.json').read_text())
        self.classification=self.registry['task_type']=='classification'
        self.models={name:load_native(name,self.root/name/info['path'],self.classification,threads)
                     for (name,info),w in zip(self.registry['models'].items(),self.registry['weights']) if w>0}

    def predict(self,frame,calibrate=True):
        frame=score_features(frame) if self.classification else forecast_features(frame)
        result=np.zeros(len(frame))
        for (name,info),weight in zip(self.registry['models'].items(),self.registry['weights']):
            if weight==0:continue
            p=predict_native(self.models[name],name,prepare(frame,self.schema,name),self.classification)
            if not self.classification:p=np.maximum(p*scale_for(frame,self.registry['target'],info['normalization']),0)
            result+=weight*p
        calibration=self.registry.get('calibration')
        if self.classification and calibrate and calibration:
            result=expit(logit(np.clip(result,1e-6,1-1e-6))*calibration['slope']+calibration['intercept'])
        return result

    def predict_interval(self,frame):
        if self.classification:raise ValueError('Intervals apply to cash-flow forecasts')
        info=self.registry.get('intervals')
        if not info:raise ValueError('Run crednexus_ml.intervals to calibrate intervals first')
        point=self.predict(frame)
        quantile=frame.horizon.map({int(h):v for h,v in info['normalized_absolute_residual_quantiles'].items()})
        if quantile.isna().any():raise ValueError('Only forecast horizons 1, 2, 3 are supported')
        half=scale_for(frame,self.registry['target'],info['scale'])*quantile.to_numpy()
        return np.column_stack([np.maximum(point-half,0),point,point+half])
