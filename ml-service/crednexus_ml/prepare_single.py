"""Prepare the agreed single-model MVP from an existing benchmark, without fitting.

The primary scorer shares XGBoost with both cash-flow models for simpler model
maintenance. This is a product tradeoff, not a claim to win validation AP.
The separate 90DPD model uses the validation-leading LightGBM. Calibration stays
model-specific; forecast intervals must be recalibrated after this step.
"""
import argparse,copy,hashlib,json,shutil
from pathlib import Path
from .common import json_dump

SELECTION={'default_next12m':'xgboost','default_90dpd_next12m':'lightgbm',
           'cash_inflow_target':'xgboost','operating_cash_outflow_target':'xgboost'}
REASON='Agreed MVP: XGBoost for primary scoring and both cash flows; validation-leading LightGBM for 90DPD. Prefer maintenance simplicity over small benchmark ensemble gains.'


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,default=Path('artifacts/benchmark_v1'))
    p.add_argument('--output',type=Path,default=Path('artifacts/single_models'));a=p.parse_args()
    if a.output.exists():raise FileExistsError('Use a new --output path; an existing bundle is not overwritten')
    a.output.mkdir(parents=True);run=json.loads((a.source/'run.json').read_text());metrics={}
    for target,algorithm in SELECTION.items():
        src=a.source/target;dst=a.output/target;dst.mkdir();(dst/algorithm).mkdir()
        reg=copy.deepcopy(json.loads((src/'registry.json').read_text()));info=reg['models'][algorithm]
        reg.update(models={algorithm:info},weights=[1.],selected_candidate=algorithm,
            selection_metric='MVP simplicity tradeoff; see deployment_policy.json',selection_split='Existing benchmark; no new model selection or test claim')
        reg['selection_reason']=REASON
        if reg['task_type']=='classification':reg['calibration']=json.loads((src/'calibrators.json').read_text())[algorithm]
        else:reg.pop('intervals',None)
        for name in [info['path'],'model.json']:shutil.copy2(src/algorithm/name,dst/algorithm/name)
        shutil.copy2(src/'schema.json',dst/'schema.json');json_dump(dst/'registry.json',reg)
        candidate=json.loads((src/'metrics.json').read_text())[algorithm]
        json_dump(dst/'metrics.json',{algorithm:candidate});metrics[target]={'algorithm':algorithm,**candidate}
    # Read-only local panel reuse for interval calibration/parity; never exported.
    (a.output/'panel').symlink_to((a.source/'panel').resolve(),target_is_directory=True)
    json_dump(a.output/'run.json',run);json_dump(a.output/'registry.json',{t:t+'/registry.json' for t in SELECTION})
    json_dump(a.output/'deployment_policy.json',{'selection':SELECTION,'reason':REASON,
        'benchmark_dataset_manifest_sha256':run['dataset_manifest_sha256'],
        'benchmark_run_sha256':hashlib.sha256((a.source/'run.json').read_bytes()).hexdigest(),
        'uncertainty':'Forecast intervals need fresh held-out-validation residual calibration for these single models.',
        'evaluation_note':'These test cohorts have already been inspected; they are historical benchmark results, not a new untouched confirmation set.'})
    json_dump(a.output/'selected_model_metrics.json',metrics)
    print('Prepared single-model MVP:',a.output,SELECTION)


if __name__=='__main__':main()
