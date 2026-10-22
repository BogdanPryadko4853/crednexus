"""Offline smoke test using the small synthetic examples committed with weights."""
import argparse,hashlib,json,sys
from pathlib import Path
import numpy as np
import pandas as pd
from .onnx_inference import OnnxPredictor


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--models',type=Path,default=Path('models/onnx'));a=p.parse_args()
    root=a.models;checks=json.loads((root/'checksums.json').read_text())
    for rel,sha in checks.items():
        if hashlib.sha256((root/rel).read_bytes()).hexdigest()!=sha:raise ValueError(f'Checksum mismatch: {rel}')
    examples=json.loads((root/'examples.json').read_text());report={}
    for target in json.loads((root/'registry.json').read_text()):
        case=examples['scoring' if target.startswith('default') else 'forecast']
        frame=pd.DataFrame(case['rows']);model=OnnxPredictor(root,target);pred=model.predict(frame)
        np.testing.assert_allclose(pred,case['expected'][target],rtol=1e-9,atol=1e-7)
        result={'prediction':pred.tolist()}
        if not target.startswith('default'):result['intervals']=model.predict_interval(frame).tolist()
        report[target]=result
    unexpected=[name for name in ('catboost','lightgbm','xgboost','torch','sklearn') if name in sys.modules]
    if unexpected:raise RuntimeError(f'Unexpected runtime dependencies: {unexpected}')
    print(json.dumps({'status':'passed','provider':model.runtime.provider,'runtime':model.runtime.as_dict(),
                      'native_ml_imports':False,'models':report},indent=2))


if __name__=='__main__':main()
