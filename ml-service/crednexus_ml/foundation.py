"""Chronos-2 CPU fine-tuning and equal-panel evaluation against trained boosting.

Only train companies and months <=47 are used for gradient updates. Evaluation
origins are selected from features before reading labels, with three horizons.
"""
from __future__ import annotations
import argparse,gc,hashlib,json,time,importlib.metadata
from pathlib import Path
import numpy as np
import pandas as pd
from .common import SEED,company_fold,json_dump,regression_metrics
from .inference import Predictor

MEASURES=['cash_inflow','operating_cash_outflow','sales','operating_expense','cash_balance']
REVISIONS={'autogluon/chronos-2-small':'ddec01313e50b6bc58ebaa92ede81bc24a3d9f9a',
           'amazon/chronos-2':'29ec3766d36d6f73f0696f85560a422f50e8498c'}


def make_panel(root,out,n=160):
    rng=np.random.default_rng(SEED)
    companies=pd.read_parquet(root/'companies');selected={}
    for split in ['validation','test','stress_test']:
        ids=companies.loc[companies.split.eq(split),'company_id'].to_numpy()
        if split=='validation':ids=ids[company_fold(ids)<7]
        selected[split]=set(rng.choice(ids,min(n,len(ids)),replace=False))
    chosen=set.union(*selected.values());records=[];inputs=[];training=[]
    for i,path in enumerate(sorted((root/'monthly_observed').glob('*.parquet'))):
        meta=pd.read_parquet(root/'companies'/path.name).set_index('company_id')
        monthly=pd.read_parquet(path)
        ff=None
        for cid,history in monthly.groupby('company_id',sort=False):
            split=meta.loc[cid,'split'];birth=int(meta.loc[cid,'birth_month_idx'])
            values=history[MEASURES].to_numpy(dtype=np.float32).T
            if split=='train' and birth<=29 and company_fold([cid])[0]<1:
                training.append(values[:,birth:48].copy())
            if cid not in chosen:continue
            if ff is None:ff=pd.read_parquet(root/'forecast_features'/path.name)
            eligible=ff.loc[ff.company_id.eq(cid)]
            counts=eligible.groupby('as_of_month_idx').horizon.nunique()
            origins=counts.index[counts.eq(3)].to_numpy()
            if not len(origins):continue
            origins=np.sort(rng.choice(origins,min(2,len(origins)),replace=False))
            for origin in origins:
                rows=eligible.loc[eligible.as_of_month_idx.eq(origin)].sort_values('horizon')
                assert len(rows)==3
                context=values[:,max(birth,int(origin)-47):int(origin)+1].copy()
                inputs.append(context)
                for _,row in rows.iterrows():
                    rec=row.to_dict();rec['input_index']=len(inputs)-1
                    idx=int(row.target_month_idx)-12
                    for j,key in enumerate(MEASURES[:2]):rec[key+'_seasonal_target']=values[j,idx]
                    records.append(rec)
        if i%80==0:print(f'Foundation histories {i+1}/400',flush=True)
    rng.shuffle(training);training=training[:4000]
    x=pd.DataFrame(records)
    # Labels are read only after panel membership has been fixed from features.
    ids=set(x.sample_id);label_parts=[]
    for p in sorted((root/'forecast_labels').glob('*.parquet')):
        y=pd.read_parquet(p);label_parts.append(y.loc[y.sample_id.isin(ids)])
    y=pd.concat(label_parts).set_index('sample_id').loc[x.sample_id].reset_index()
    x.to_parquet(out/'features.parquet',index=False);y.to_parquet(out/'labels.parquet',index=False)
    # NPZ with explicit lengths avoids pickled Python objects.
    lengths=np.array([v.shape[1] for v in inputs]);train_lengths=np.array([v.shape[1] for v in training])
    np.savez_compressed(out/'histories.npz',inputs=np.concatenate(inputs,axis=1),lengths=lengths,
                        train=np.concatenate(training,axis=1),train_lengths=train_lengths)
    json_dump(out/'panel.json',{'seed':SEED,'companies_requested_per_split':n,'contexts':len(inputs),
        'rows':x.company_split.value_counts().to_dict(),'training_series':len(training),'train_max_month_idx':47,
        'sample_id_sha256':hashlib.sha256('\n'.join(x.sample_id).encode()).hexdigest(),
        'note':'Two feature-selected origins per company, complete horizons; validation tuning companies only.'})
    return x,y,inputs,training


def load_panel(out):
    z=np.load(out/'histories.npz')
    inputs=np.split(z['inputs'],np.cumsum(z['lengths'])[:-1],axis=1)
    train=np.split(z['train'],np.cumsum(z['train_lengths'])[:-1],axis=1)
    return pd.read_parquet(out/'features.parquet'),pd.read_parquet(out/'labels.parquet'),inputs,train


def predict(pipeline,inputs,x,out,name):
    start=time.perf_counter()
    q,m=pipeline.predict_quantiles(inputs,prediction_length=3,batch_size=64,context_length=48,quantile_levels=[.1,.5,.9])
    # Each result is [n_channels, horizon, quantile]; use the median for MAE/WAPE.
    values=np.stack([v.detach().cpu().numpy()[:2] for v in q])
    rows=x.input_index.to_numpy();h=x.horizon.to_numpy()-1
    result={}
    for j,target in enumerate(['cash_inflow_target','operating_cash_outflow_target']):
        for k,level in enumerate(['q10','median','q90']):result[target+'_'+level]=np.maximum(values[rows,j,h,k],0)
    pred=pd.DataFrame({'sample_id':x.sample_id,**result})
    pred.to_parquet(out/(name+'_predictions.parquet'),index=False)
    seconds=time.perf_counter()-start
    # Warm latency for one company, all five channels, 3-month forecast.
    pipeline.predict_quantiles(inputs[:1],prediction_length=3,batch_size=8,context_length=48)
    times=[]
    for _ in range(5):
        t=time.perf_counter();pipeline.predict_quantiles(inputs[:1],prediction_length=3,batch_size=8,context_length=48);times.append(time.perf_counter()-t)
    info={'panel_seconds':seconds,'contexts':len(inputs),'one_company_median_seconds':float(np.median(times)),
          'parameters':sum(v.numel() for v in pipeline.model.parameters()),'device':str(pipeline.model.device)}
    json_dump(out/(name+'_runtime.json'),info)
    print(name,info,flush=True)
    return pred


def main():
    import torch
    from chronos import Chronos2Pipeline
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('dataset',type=Path)
    p.add_argument('--boosting',type=Path,default=Path('artifacts/benchmark_v1'))
    p.add_argument('--output',type=Path,default=Path('artifacts/foundation'))
    p.add_argument('--steps',type=int,default=200);p.add_argument('--companies',type=int,default=160)
    p.add_argument('--variants',default='chronos2_small_zero,chronos2_small_finetuned,chronos2_small_finetuned1000,chronos2_base_zero')
    args=p.parse_args();out=args.output;out.mkdir(exist_ok=True,parents=True)
    fingerprint=hashlib.sha256((args.dataset/'manifest.json').read_bytes()).hexdigest()
    if (out/'run.json').exists() and json.loads((out/'run.json').read_text())['dataset_manifest_sha256']!=fingerprint:
        raise ValueError('Foundation output belongs to another dataset')
    torch.set_num_threads(4);torch.manual_seed(SEED);np.random.seed(SEED)
    if (out/'panel.json').exists():x,y,inputs,train=load_panel(out)
    else:x,y,inputs,train=make_panel(args.dataset,out,args.companies)
    json_dump(out/'run.json',{'dataset_manifest_sha256':fingerprint,
        'steps':args.steps,'long_finetune_steps':1000,'device':'cpu','context_length':48,'seed':SEED,'channels':MEASURES,
        'selection':'validation only, no test/stress labels for model or blend choice',
        'models':REVISIONS,'license':'Apache-2.0',
        'versions':{name:importlib.metadata.version(name) for name in ['chronos-forecasting','torch','transformers','accelerate','einops']}})
    names=args.variants.split(',')
    for name in names:
        if (out/(name+'_predictions.parquet')).exists():continue
        model_id='amazon/chronos-2' if name=='chronos2_base_zero' else 'autogluon/chronos-2-small'
        local=out/('chronos-2' if name=='chronos2_base_zero' else 'chronos-2-small')
        is_local=(local/'config.json').exists()
        pipeline=Chronos2Pipeline.from_pretrained(str(local) if is_local else model_id,device_map='cpu',
            **({} if is_local else {'revision':REVISIONS[model_id]}))
        if not is_local:
            pipeline.save_pretrained(local)
            json_dump(local/'source.json',{'repo':model_id,'revision':REVISIONS[model_id],'license':'Apache-2.0',
                'local_weights_sha256':hashlib.sha256((local/'model.safetensors').read_bytes()).hexdigest()})
        if name.startswith('chronos2_small_finetuned'):
            long=name.endswith('1000');steps=1000 if long else args.steps
            fine_dir=out/('finetuning1000' if long else 'finetuning')
            checkpoint=fine_dir/'finetuned-ckpt'
            if (checkpoint/'config.json').exists():pipeline=Chronos2Pipeline.from_pretrained(str(checkpoint),device_map='cpu')
            else:
                t=time.perf_counter()
                pipeline=pipeline.fit(train,prediction_length=3,context_length=48,min_past=18,
                    num_steps=steps,batch_size=32,learning_rate=1e-5,output_dir=fine_dir,
                    use_cpu=True,optim='adamw_torch',logging_steps=25,disable_tqdm=True,
                    seed=SEED,data_seed=SEED,bf16=False,tf32=False)
                json_dump(out/('finetuning1000_runtime.json' if long else 'finetuning_runtime.json'),{'seconds':time.perf_counter()-t,'steps':steps,'series':len(train)})
        predict(pipeline,inputs,x,out,name);del pipeline;gc.collect()
    if not all((args.boosting/t/'registry.json').exists() for t in ['cash_inflow_target','operating_cash_outflow_target']):
        print('Predictions saved; rerun after boosting training to compare.',flush=True)
        return
    metrics={};selected={};allpred={}
    for target in ['cash_inflow_target','operating_cash_outflow_target']:
        predictions={name:pd.read_parquet(out/(name+'_predictions.parquet'))[target+'_median'].to_numpy() for name in names}
        booster=Predictor(args.boosting,target);predictions['boosting_selected']=booster.predict(x);del booster
        key=target.removesuffix('_target');predictions['seasonal_naive']=x[key+'_seasonal_target'].fillna(x[key+'_mean_3']).fillna(0).to_numpy()
        val=x.company_split.eq('validation').to_numpy();truth=y[target].to_numpy()
        candidates={name:regression_metrics(truth[val],pred[val])['wape'] for name,pred in predictions.items()}
        best=min(candidates,key=candidates.get)
        # Validation-only blend search, with boosted selected model as the fixed anchor.
        best_weight=0.;best_blend='boosting_selected';best_value=candidates['boosting_selected']
        for name in names:
            for w in np.arange(.1,1.01,.1):
                pr=w*predictions[name]+(1-w)*predictions['boosting_selected']
                v=regression_metrics(truth[val],pr[val])['wape']
                if v<best_value:best_value=v;best_weight=float(w);best_blend=name
        selected[target]={'best_single':best,'blend_foundation':best_blend,'foundation_weight':best_weight,'validation_wape':best_value}
        predictions['validation_selected_blend']=best_weight*predictions[best_blend]+(1-best_weight)*predictions['boosting_selected']
        # Freeze decisions before test metrics.
        json_dump(out/'selection.json',selected)
        metrics[target]={name:{split:regression_metrics(truth[x.company_split.eq(split)],pred[x.company_split.eq(split)],x.loc[x.company_split.eq(split),'horizon'])
            for split in ['validation','test','stress_test']} for name,pred in predictions.items()}
        for name in names:
            pp=pd.read_parquet(out/(name+'_predictions.parquet'))
            for split in ['validation','test','stress_test']:
                mask=x.company_split.eq(split).to_numpy();lo=pp.loc[mask,target+'_q10'].to_numpy();hi=pp.loc[mask,target+'_q90'].to_numpy()
                metrics[target][name][split]['p10_p90_coverage']=float(((truth[mask]>=lo)&(truth[mask]<=hi)).mean())
        for name,pred in predictions.items():allpred[target+'_'+name]=pred
    pd.DataFrame({'sample_id':x.sample_id,**allpred}).to_parquet(out/'comparison_predictions.parquet',index=False)
    json_dump(out/'metrics.json',metrics);print('Foundation comparison complete',selected,flush=True)


if __name__=='__main__':main()
