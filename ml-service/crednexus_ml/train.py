"""CPU HPO for three boosting families. Selection/calibration never uses test labels."""
from __future__ import annotations
import argparse
import gc
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import time
import numpy as np
import pandas as pd
import optuna
from scipy.special import expit,logit
from sklearn.linear_model import LogisticRegression
from .common import (ALGORITHMS,SEED,classification_metrics,company_fold,fit_schema,json_dump,latency,
                      load_native,predict_native,prepare,regression_metrics,save_native)
from .data import forecast_panel,load_scoring


def parameters(trial,algorithm,classification,threads,max_rounds=1200):
    lr=trial.suggest_float('learning_rate',.025,.13,log=True)
    loss='logloss' if classification else trial.suggest_categorical('loss',['mae','rmse'])
    if algorithm=='catboost':
        from catboost import CatBoostClassifier,CatBoostRegressor
        kw=dict(iterations=max_rounds,learning_rate=lr,depth=trial.suggest_int('depth',4,8),
                l2_leaf_reg=trial.suggest_float('l2_leaf_reg',1,25,log=True),
                random_strength=trial.suggest_float('random_strength',.05,2,log=True),
                bagging_temperature=trial.suggest_float('bagging_temperature',0,1),
                random_seed=SEED,thread_count=threads,verbose=False,allow_writing_files=False,
                loss_function='Logloss' if classification else 'MAE' if loss=='mae' else 'RMSE')
        return (CatBoostClassifier if classification else CatBoostRegressor)(**kw),loss
    if algorithm=='lightgbm':
        from lightgbm import LGBMClassifier,LGBMRegressor
        kw=dict(n_estimators=max_rounds,learning_rate=lr,num_leaves=trial.suggest_categorical('num_leaves',[15,31,63]),
                min_child_samples=trial.suggest_int('min_child_samples',30,180),
                reg_lambda=trial.suggest_float('reg_lambda',.05,30,log=True),
                reg_alpha=trial.suggest_float('reg_alpha',1e-4,2,log=True),
                colsample_bytree=trial.suggest_float('colsample_bytree',.7,1),
                subsample=trial.suggest_float('subsample',.7,1),subsample_freq=1,
                objective='binary' if classification else 'regression_l1' if loss=='mae' else 'regression',
                max_bin=127,deterministic=True,force_col_wise=True,verbosity=-1,n_jobs=threads,random_state=SEED)
        return (LGBMClassifier if classification else LGBMRegressor)(**kw),loss
    from xgboost import XGBClassifier,XGBRegressor
    kw=dict(n_estimators=max_rounds,learning_rate=lr,max_depth=trial.suggest_int('max_depth',3,8),
            min_child_weight=trial.suggest_float('min_child_weight',2,35,log=True),
            reg_lambda=trial.suggest_float('reg_lambda',.1,30,log=True),reg_alpha=trial.suggest_float('reg_alpha',1e-4,2,log=True),
            colsample_bytree=trial.suggest_float('colsample_bytree',.7,1),subsample=trial.suggest_float('subsample',.7,1),
            objective='binary:logistic' if classification else 'reg:absoluteerror' if loss=='mae' else 'reg:squarederror',
            eval_metric='logloss' if classification else 'mae' if loss=='mae' else 'rmse',
            tree_method='hist',device='cpu',enable_categorical=True,max_bin=128,n_jobs=threads,
            random_state=SEED,early_stopping_rounds=60)
    return (XGBClassifier if classification else XGBRegressor)(**kw),loss


def fit_model(model,algorithm,x,y,xv,yv,cats,w=None,wv=None):
    if algorithm=='catboost':
        from catboost import Pool
        model.fit(x,y,cat_features=cats,sample_weight=w,eval_set=Pool(xv,yv,cat_features=cats,weight=wv),
                  early_stopping_rounds=60,use_best_model=True,verbose=False)
    elif algorithm=='lightgbm':
        import lightgbm as lgb
        model.fit(x,y,sample_weight=w,eval_set=[(xv,yv)],eval_sample_weight=[wv] if wv is not None else None,
                  callbacks=[lgb.early_stopping(60,verbose=False)])
    else:
        model.fit(x,y,sample_weight=w,eval_set=[(xv,yv)],sample_weight_eval_set=[wv] if wv is not None else None,verbose=False)


def fitted_prediction(model,x,classification):
    return model.predict_proba(x)[:,1] if classification else model.predict(x)


def scale_for(frame,target,normalization):
    if normalization=='raw':return np.full(len(frame),1e6)
    key=target.removesuffix('_target')
    return np.clip(frame[key+'_mean_12'].fillna(frame[key+'_mean_3']).fillna(1e4).to_numpy(),1e4,1e8)


def optimize_family(root,algorithm,x,y,xt,yt,schema,classification,threads,trials,target,full_x=None,full_y=None):
    root.mkdir(parents=True,exist_ok=True)
    if (root/'trials.json').exists() and (root/'model.json').exists() and (classification or (root/'complete.json').exists()):
        history=json.loads((root/'trials.json').read_text())
        if len(history)==trials:
            print(f'{target}/{algorithm}: reuse completed search',flush=True)
            return json.loads((root/'model.json').read_text())
    xp=prepare(x,schema,algorithm);xvp=prepare(xt,schema,algorithm)
    info_path=root/'model.json';best_value=-np.inf if classification else np.inf
    best_info=None
    study=optuna.create_study(direction='maximize' if classification else 'minimize',sampler=optuna.samplers.TPESampler(seed=SEED,n_startup_trials=4))
    def objective(trial):
        nonlocal best_value,best_info
        normalization='raw' if classification else trial.suggest_categorical('normalization',['raw','relative'])
        model,loss=parameters(trial,algorithm,classification,threads,1200 if classification else 900)
        factor=np.ones(len(x)) if classification else scale_for(x,target,normalization)
        factor_v=np.ones(len(xt)) if classification else scale_for(xt,target,normalization)
        w=wv=None
        if normalization=='relative':
            power=1 if loss=='mae' else 2
            denominator=np.median(factor)
            w=np.clip((factor/denominator)**power,.001,1000);wv=np.clip((factor_v/denominator)**power,.001,1000)
        start=time.perf_counter();fit_model(model,algorithm,xp,y/factor,xvp,yt/factor_v,list(schema['categories']),w,wv)
        pred=fitted_prediction(model,xvp,classification)*factor_v
        value=classification_metrics(yt,pred)['average_precision'] if classification else regression_metrics(yt,pred)['wape']
        improved=value>best_value if classification else value<best_value
        if improved:
            path=save_native(model,algorithm,root/'model')
            best_value=value
            iterations=int(model.tree_count_) if algorithm=='catboost' else int(model.best_iteration_ or model.n_estimators) if algorithm=='lightgbm' else int(model.best_iteration+1)
            best_info={'algorithm':algorithm,'path':path.name,'normalization':normalization,'validation_objective':value,
                       'params':dict(trial.params),'iterations':iterations,'fit_seconds':time.perf_counter()-start,'training_rows':len(x)}
            json_dump(info_path,best_info)
        print(f'{target}/{algorithm} trial {trial.number+1}/{trials}: {value:.5f}; best {best_value:.5f}',flush=True)
        del model;gc.collect()
        return value
    study.optimize(objective,n_trials=trials)
    json_dump(root/'trials.json',[{'number':t.number,'value':t.value,'params':t.params} for t in study.trials])
    if not classification and full_x is not None:
        fixed=optuna.trial.FixedTrial(best_info['params'])
        model,loss=parameters(fixed,algorithm,False,threads,max(250,min(1600,int(best_info['iterations']*1.5))))
        norm=best_info['normalization'];factor=scale_for(full_x,target,norm);fv=scale_for(xt,target,norm)
        w=wv=None
        if norm=='relative':
            power=1 if loss=='mae' else 2;den=np.median(factor)
            w=np.clip((factor/den)**power,.001,1000);wv=np.clip((fv/den)**power,.001,1000)
        xfull=prepare(full_x,schema,algorithm)
        start=time.perf_counter();fit_model(model,algorithm,xfull,full_y/factor,xvp,yt/fv,list(schema['categories']),w,wv)
        value=regression_metrics(yt,fitted_prediction(model,xvp,False)*fv)['wape']
        if value<=best_value:
            path=save_native(model,algorithm,root/'model')
            best_info.update(path=path.name,validation_objective=value,training_rows=len(full_x),fit_seconds=time.perf_counter()-start)
            best_info['iterations']=int(model.tree_count_) if algorithm=='catboost' else int(model.best_iteration_ or model.n_estimators) if algorithm=='lightgbm' else int(model.best_iteration+1)
            json_dump(info_path,best_info)
        print(f'{target}/{algorithm} larger-train refit: {value:.5f}; retained {best_info["validation_objective"]:.5f}',flush=True)
        del xfull,model;gc.collect()
    json_dump(root/'complete.json',{'trials':trials,'target':target,'classification':classification,
                                  'validation_objective':best_info['validation_objective']})
    return best_info


def simplex_weights(predictions,y,classification):
    from sklearn.metrics import average_precision_score
    best=None;best_value=-np.inf if classification else np.inf
    for i in range(11):
        for j in range(11-i):
            w=np.array([i,j,10-i-j])/10
            p=predictions@w
            value=average_precision_score(y,p) if classification else np.abs(y-np.maximum(p,0)).mean()
            if (value>best_value if classification else value<best_value):best_value=value;best=w
    return best.tolist()


def calibrate(y,p):
    model=LogisticRegression(C=100,max_iter=2000,random_state=SEED)
    model.fit(logit(np.clip(p,1e-6,1-1e-6))[:,None],y)
    slope=float(model.coef_[0,0]);intercept=float(model.intercept_[0])
    if slope<=0:raise ValueError('Non-monotone calibration; inspect validation data')
    return {'slope':slope,'intercept':intercept,'method':'Platt on disjoint validation companies'}


def calibrated(p,info):return expit(logit(np.clip(p,1e-6,1-1e-6))*info['slope']+info['intercept'])


def update_index(path,target):
    # Read at write time so a later phase does not replace an older snapshot.
    entries=json.loads(path.read_text()) if path.exists() else {}
    entries[target]=target+'/registry.json'
    json_dump(path,entries)


def task_prediction(frame,schema,models,task_dir,classification,target):
    out=[]
    for algorithm,info in models.items():
        model=load_native(algorithm,task_dir/algorithm/info['path'],classification)
        p=predict_native(model,algorithm,prepare(frame,schema,algorithm),classification)
        if not classification:p=np.maximum(p*scale_for(frame,target,info['normalization']),0)
        out.append(p)
        del model;gc.collect()
    return np.column_stack(out)


def evaluate_task(task_dir,x,y,schema,models,classification,target,validation_mask,calibration_mask,split_column):
    task_dir=Path(task_dir)
    pv=task_prediction(x.loc[validation_mask],schema,models,task_dir,classification,target)
    weights=simplex_weights(pv,y[validation_mask],classification)
    metrics={};candidate_names=list(models)+['blend']
    candidate_weights={name:np.eye(3)[i].tolist() for i,name in enumerate(models)}|{'blend':weights}
    calibrators={}
    if classification:
        pc=task_prediction(x.loc[calibration_mask],schema,models,task_dir,True,target)
        calibrators={name:calibrate(y[calibration_mask],pc@w) for name,w in candidate_weights.items()}
        json_dump(task_dir/'calibrators.json',calibrators)
    for name,w in candidate_weights.items():
        metrics[name]={'validation_selection':classification_metrics(y[validation_mask],pv@w) if classification else regression_metrics(y[validation_mask],pv@w)}
    key='average_precision' if classification else 'wape'
    selected=(max if classification else min)(candidate_names,key=lambda name:metrics[name]['validation_selection'][key])
    registry={'target':target,'task_type':'classification' if classification else 'regression','models':models,
              'weights':candidate_weights[selected],'selected_candidate':selected,'calibration':calibrators.get(selected),
              'selection_metric':key,'selection_split':'validation_tune only','schema':'schema.json'}
    # Write selection before evaluating test/OOD, making the selection rule reviewable.
    json_dump(task_dir/'registry.json',registry)
    for split in ('validation','test','stress_test'):
        mask=x[split_column].eq(split).to_numpy()
        pp=task_prediction(x.loc[mask],schema,models,task_dir,classification,target)
        for name,w in candidate_weights.items():
            p=pp@w
            if classification:
                metrics[name][split]={'raw':classification_metrics(y[mask],p),'calibrated':classification_metrics(y[mask],calibrated(p,calibrators[name]))}
            else:metrics[name][split]=regression_metrics(y[mask],p,x.loc[mask,'horizon'].to_numpy())
        prediction=pd.DataFrame({'id':x.loc[mask,'application_id' if classification else 'sample_id'].to_numpy(),'target':y[mask],
                                 **{name:pp@w for name,w in candidate_weights.items()}})
        prediction.to_parquet(task_dir/f'{split}_predictions.parquet',index=False,compression='zstd')
    json_dump(task_dir/'metrics.json',metrics)
    print(f'SELECTED {target}: {selected}, weights={registry["weights"]}',flush=True)
    return registry


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('dataset',type=Path)
    p.add_argument('--output',type=Path,default=Path('artifacts/benchmark_v1'))
    p.add_argument('--tasks',default='scoring,forecast');p.add_argument('--score-trials',type=int,default=12)
    p.add_argument('--forecast-trials',type=int,default=8);p.add_argument('--threads',type=int,default=4)
    args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    manifest=json.loads((args.dataset/'manifest.json').read_text())
    run={'dataset_manifest_sha256':hashlib.sha256((args.dataset/'manifest.json').read_bytes()).hexdigest(),
         'dataset_generator_version':manifest['generator_version'],'seed':SEED,'device':'cpu','threads':args.threads,
         'score_trials_per_family':args.score_trials,'forecast_trials_per_family':args.forecast_trials,
         'versions':{name:metadata.version(name) for name in ('numpy','pandas','catboost','lightgbm','xgboost','optuna','scikit-learn')},
         'validation_rule':'CRC32(company_id)%10 <7 for tuning/selection; >=7 for calibration; test and OOD never used for selection.',
         'source_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in Path(__file__).parent.glob('*.py')}}
    existing=args.output/'run.json'
    if existing.exists() and json.loads(existing.read_text())['dataset_manifest_sha256']!=run['dataset_manifest_sha256']:
        raise ValueError('Output belongs to another dataset')
    json_dump(existing,run)
    registry_path=args.output/'registry.json';registries=json.loads(registry_path.read_text()) if registry_path.exists() else {}
    if 'scoring' in args.tasks.split(','):
        x,labels=load_scoring(args.dataset)
        columns=[c for c in x if c not in ('company_id','application_id','split','as_of_month_idx')]
        train=x.split.eq('train').to_numpy();validation=x.split.eq('validation').to_numpy();fold=company_fold(x.company_id)
        tune=validation&(fold<7);calibration=validation&(fold>=7);schema=fit_schema(x.loc[train],columns)
        for target in ('default_next12m','default_90dpd_next12m'):
            task_dir=args.output/target;task_dir.mkdir(exist_ok=True);json_dump(task_dir/'schema.json',schema)
            y=labels[target].to_numpy();models={}
            for algorithm in ALGORITHMS:
                models[algorithm]=optimize_family(task_dir/algorithm,algorithm,x.loc[train],y[train],x.loc[tune],y[tune],schema,True,args.threads,args.score_trials,target)
            registry=evaluate_task(task_dir,x,y,schema,models,True,target,tune,calibration,'split')
            update_index(registry_path,target)
        del x,labels;gc.collect()
    if 'forecast' in args.tasks.split(','):
        cache=args.output/'panel'
        if (cache/'panel.json').exists():
            info=json.loads((cache/'panel.json').read_text())
        else:
            xx,yy,info=forecast_panel(args.dataset,cache);del xx,yy;gc.collect()
        x=pd.read_parquet(cache/'forecast_features.parquet');labels=pd.read_parquet(cache/'forecast_labels.parquet')
        assert x.sample_id.equals(labels.sample_id)
        columns=[c for c in x if c not in ('sample_id','company_id','company_split','time_split','as_of_month_idx','target_month_idx')]
        train=x.company_split.eq('train').to_numpy();validation=x.company_split.eq('validation').to_numpy();fold=company_fold(x.company_id)
        tune=validation&(fold<7);calibration=validation&(fold>=7);schema=fit_schema(x.loc[train],columns)
        rng=np.random.default_rng(SEED);positions=np.flatnonzero(train);chosen=rng.choice(positions,min(120000,len(positions)),replace=False)
        for target in ('cash_inflow_target','operating_cash_outflow_target'):
            task_dir=args.output/target;task_dir.mkdir(exist_ok=True);json_dump(task_dir/'schema.json',schema)
            y=labels[target].to_numpy();models={}
            for algorithm in ALGORITHMS:
                models[algorithm]=optimize_family(task_dir/algorithm,algorithm,x.iloc[chosen],y[chosen],x.loc[tune],y[tune],schema,False,args.threads,args.forecast_trials,target,x.loc[train],y[train])
            registry=evaluate_task(task_dir,x,y,schema,models,False,target,tune,calibration,'company_split')
            # Baselines use only historical data available at each origin.
            baseline={}
            for split in ('validation','test','stress_test'):
                mask=x.company_split.eq(split).to_numpy();key=target.removesuffix('_target')
                seasonal=x.loc[mask,key+'_seasonal_target'].fillna(x.loc[mask,key+'_mean_3']).fillna(0).to_numpy()
                baseline[split]={'seasonal_naive':regression_metrics(y[mask],seasonal,x.loc[mask,'horizon']),
                                 'recent_mean':regression_metrics(y[mask],x.loc[mask,key+'_mean_3'].fillna(0),x.loc[mask,'horizon'])}
            json_dump(task_dir/'baselines.json',baseline)
            update_index(registry_path,target)
    print('Training complete:',registry_path,flush=True)


if __name__=='__main__':main()
