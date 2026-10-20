"""Shared, serializable feature processing and native CPU models."""
from __future__ import annotations
import json
import hashlib
from pathlib import Path
import time
import zlib
import numpy as np
import pandas as pd

SEED=20261021
ALGORITHMS=('catboost','lightgbm','xgboost')


def company_fold(ids):
    return np.array([zlib.crc32(str(value).encode())%10 for value in ids])


def safe_div(a,b):
    return np.asarray(a)/np.maximum(np.asarray(b),1.)


def scale_for(frame,target,normalization):
    if normalization=='raw':return np.full(len(frame),1e6)
    key=target.removesuffix('_target')
    return np.clip(frame[key+'_mean_12'].fillna(frame[key+'_mean_3']).fillna(1e4).to_numpy(),1e4,1e8)


def score_features(frame):
    x=frame.copy()
    income=x.cash_inflow_mean_6
    expense=x.operating_expense_mean_6
    for name,numerator,denominator in [
        ('debt_to_income',x.debt_outstanding,income),('payables_to_expense',x.accounts_payable,expense),
        ('overdue_to_expense',x.overdue_payables,expense),('receivables_to_sales',x.accounts_receivable,x.sales_mean_6),
        ('inventory_to_sales',x.inventory,x.sales_mean_6),('cash_months_expense',x.cash_balance_mean_3,expense),
        ('payment_to_income',x.proposed_monthly_payment+x.existing_monthly_debt_service,income),
        ('accrual_margin_6',x.sales_mean_6-expense,x.sales_mean_6),
        ('liquidity_to_short_obligations',x.cash_balance_lag_0+x.accounts_receivable,x.accounts_payable+x.loan_arrears)]:
        x[name]=safe_div(numerator,denominator)
    return x.replace([np.inf,-np.inf],np.nan)


def forecast_features(frame):
    x=frame.copy()
    for measure in ('cash_inflow','operating_cash_outflow'):
        mean=np.maximum(x[measure+'_mean_12'].fillna(x[measure+'_mean_3']).fillna(1),1)
        x[measure+'_recent_to_year']=safe_div(x[measure+'_mean_3'],mean)
        x[measure+'_seasonal_to_year']=safe_div(x[measure+'_seasonal_target'],mean)
        x[measure+'_cv_12']=safe_div(x[measure+'_std_12'],mean)
    x['accrual_margin_6']=safe_div(x.sales_mean_6-x.operating_expense_mean_6,x.sales_mean_6)
    x['cash_buffer']=safe_div(x.cash_balance_lag_0,x.operating_cash_outflow_mean_3)
    return x.replace([np.inf,-np.inf],np.nan)


def fit_schema(frame,columns):
    cats={c:sorted(frame[c].fillna('__MISSING__').astype(str).unique().tolist()) for c in columns if frame[c].dtype==object or isinstance(frame[c].dtype,pd.CategoricalDtype)}
    return {'columns':list(columns),'categories':cats}


def prepare(frame,schema,algorithm):
    missing=set(schema['columns'])-set(frame)
    if missing:raise ValueError(f'Missing model features: {sorted(missing)}')
    x=frame[schema['columns']].copy()
    for c in x:
        if c in schema['categories']:
            values=x[c].fillna('__MISSING__').astype(str)
            x[c]=values if algorithm=='catboost' else pd.Categorical(values,categories=schema['categories'][c])
        else:x[c]=pd.to_numeric(x[c],errors='raise').replace([np.inf,-np.inf],np.nan).astype('float32')
    return x


def classification_metrics(y,p):
    from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
    p=np.clip(np.asarray(p),1e-7,1-1e-7);y=np.asarray(y)
    return {'rows':len(y),'positives':int(y.sum()),'roc_auc':float(roc_auc_score(y,p)),
            'average_precision':float(average_precision_score(y,p)),'log_loss':float(log_loss(y,p)),
            'brier':float(brier_score_loss(y,p)),'observed_rate':float(y.mean()),'mean_probability':float(p.mean())}


def regression_metrics(y,p,horizon=None):
    y=np.asarray(y);p=np.maximum(np.asarray(p),0)
    result={'rows':len(y),'mae':float(np.abs(y-p).mean()),'rmse':float(np.sqrt(np.mean((y-p)**2))),
            'wape':float(np.abs(y-p).sum()/max(np.abs(y).sum(),1))}
    if horizon is not None:
        result['by_horizon']={str(h):regression_metrics(y[np.asarray(horizon)==h],p[np.asarray(horizon)==h]) for h in (1,2,3)}
    return result


def predict_native(model,algorithm,x,classification):
    if algorithm=='catboost':return model.predict_proba(x)[:,1] if classification else model.predict(x)
    if algorithm=='lightgbm':return model.predict(x,num_threads=getattr(model,'_crednexus_threads',4))
    import xgboost as xgb
    return model.predict(xgb.DMatrix(x,enable_categorical=True))


def save_native(model,algorithm,path):
    path=Path(path)
    if algorithm=='catboost':
        out=path.with_suffix('.cbm');model.save_model(str(out))
    elif algorithm=='lightgbm':
        out=path.with_suffix('.txt');model.booster_.save_model(str(out),num_iteration=model.best_iteration_ or model.n_estimators)
    else:
        out=path.with_suffix('.ubj');booster=model.get_booster()
        try:booster=booster[:model.best_iteration+1]
        except AttributeError:pass
        booster.save_model(out)
    return out


def load_native(algorithm,path,classification,threads=4):
    if algorithm=='catboost':
        from catboost import CatBoostClassifier,CatBoostRegressor
        model=(CatBoostClassifier if classification else CatBoostRegressor)(thread_count=threads)
        model.load_model(str(path));return model
    if algorithm=='lightgbm':
        import lightgbm as lgb
        # reset_parameter is unsafe on a prediction-only Booster in some LGB versions.
        model=lgb.Booster(model_file=str(path))
        model._crednexus_threads=threads
        return model
    import xgboost as xgb
    model=xgb.Booster();model.load_model(path);model.set_param({'nthread':threads,'device':'cpu'});return model


def json_dump(path,value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n')


def refresh_checksums(root):
    root=Path(root)
    json_dump(root/'checksums.json',{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(root.rglob('*')) if p.is_file() and p.name!='checksums.json'})


def latency(predict,frame,repeats=5):
    predict(frame.iloc[:1])
    times=[]
    for _ in range(repeats):
        start=time.perf_counter();predict(frame.iloc[:1]);times.append((time.perf_counter()-start)*1000)
    start=time.perf_counter();predict(frame.iloc[:1024]);batch=time.perf_counter()-start
    return {'single_row_median_ms':float(np.median(times)),'batch_rows':min(len(frame),1024),'batch_seconds':batch}
