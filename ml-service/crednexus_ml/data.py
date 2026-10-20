"""Bounded data sampling with fixed panel hashes, no test-driven selection."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
from .common import SEED,company_fold,forecast_features,score_features


def load_scoring(root):
    root=Path(root)
    x=pd.read_parquet(root/'score_features');y=pd.read_parquet(root/'score_labels')
    assert x.application_id.equals(y.application_id)
    return score_features(x),y


def forecast_panel(root,output,per_train_part=1200,per_valid_part=200):
    root=Path(root);output=Path(output);output.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((root/'manifest.json').read_text());m=manifest['config']['months']
    features=[];labels=[]
    for i,path in enumerate(sorted((root/'forecast_features').glob('*.parquet'))):
        x=pd.read_parquet(path);y=pd.read_parquet(root/'forecast_labels'/path.name)
        assert x.sample_id.equals(y.sample_id)
        rng=np.random.default_rng(np.random.SeedSequence([SEED,i,81]))
        chunks=[]
        for split in ('train','validation','test','stress_test'):
            positions=np.flatnonzero(x.company_split.eq(split).to_numpy())
            cap=per_train_part if split=='train' else per_valid_part if split=='validation' else len(positions)
            chunks.extend(rng.choice(positions,min(len(positions),cap),replace=False).tolist())
        chunks=np.array(sorted(chunks),dtype=int)
        x=x.iloc[chunks].reset_index(drop=True);y=y.iloc[chunks].reset_index(drop=True)
        monthly=pd.read_parquet(root/'monthly_observed'/path.name,columns=['company_id','cash_inflow','operating_cash_outflow'])
        ids=monthly.company_id.drop_duplicates().tolist();lookup={cid:r for r,cid in enumerate(ids)}
        rows=x.company_id.map(lookup).to_numpy();idx=x.target_month_idx.to_numpy()-12
        assert (idx<=x.as_of_month_idx.to_numpy()).all()
        for measure in ('cash_inflow','operating_cash_outflow'):
            x[measure+'_seasonal_target']=monthly[measure].to_numpy().reshape(len(ids),m)[rows,idx]
        features.append(x);labels.append(y)
        if i%80==0:print(f'Forecast panel: {i+1} shards',flush=True)
    x=forecast_features(pd.concat(features,ignore_index=True));y=pd.concat(labels,ignore_index=True)
    assert x.sample_id.equals(y.sample_id)
    x.to_parquet(output/'forecast_features.parquet',index=False,compression='zstd')
    y.to_parquet(output/'forecast_labels.parquet',index=False,compression='zstd')
    fingerprint=hashlib.sha256('\n'.join(x.sample_id).encode()).hexdigest()
    info={'rows':x.company_split.value_counts().to_dict(),'sample_id_sha256':fingerprint,
          'method':'Fixed random training/validation rows per source shard; complete test and OOD cohorts.',
          'per_train_part':per_train_part,'per_valid_part':per_valid_part,'seed':SEED}
    (output/'panel.json').write_text(json.dumps(info,indent=2)+'\n')
    return x,y,info
