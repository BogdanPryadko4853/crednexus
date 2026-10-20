"""Check constant cash balances without confusing exhausted/closed firms with healthy ones."""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd


def max_run(mask):
    current=np.zeros(len(mask),dtype=int);longest=current.copy()
    for column in mask.T:
        current=np.where(column,current+1,0);longest=np.maximum(longest,current)
    return longest


def check(root):
    root=Path(root);manifest=json.loads((root/'manifest.json').read_text());m=manifest['config']['months']
    result={'companies':0,'operating_months':0,'operating_zero_cash_months':0,'closed_months':0,'closed_zero_cash_months':0,
            'zero_cash_runs_6m_operating_companies':0,'zero_cash_runs_12m_operating_companies':0,
            'positive_constant_runs_12m_operating_companies':0,'max_zero_run_operating':0,'cash_frozen_with_nonzero_net_flow_months':0}
    for path in sorted((root/'audit/monthly_truth').glob('*.parquet')):
        d=pd.read_parquet(path,columns=['company_id','business_state','cash_balance','opening_balance','cash_inflow',
            'operating_cash_outflow','loan_disbursement','background_financing','owner_injection','asset_sale_inflow',
            'debt_payment','investment_outflow','owner_draw'])
        n=d.company_id.nunique();a={k:d[k].to_numpy().reshape(n,m) for k in d if k!='company_id'}
        op=a['business_state']<3;closed=a['business_state']==3;zero=a['cash_balance']<.01
        run=max_run(op&zero)
        flat=(np.abs(np.diff(a['cash_balance']))<1e-6)&(a['cash_balance'][:,1:]>.01)&op[:,1:]&op[:,:-1]
        result['companies']+=n;result['operating_months']+=int(op.sum());result['operating_zero_cash_months']+=int((op&zero).sum())
        result['closed_months']+=int(closed.sum());result['closed_zero_cash_months']+=int((closed&zero).sum())
        result['zero_cash_runs_6m_operating_companies']+=int((run>=6).sum());result['zero_cash_runs_12m_operating_companies']+=int((run>=12).sum())
        result['positive_constant_runs_12m_operating_companies']+=int((max_run(flat)>=11).sum())
        result['max_zero_run_operating']=max(result['max_zero_run_operating'],int(run.max()))
        net=a['cash_inflow']+a['loan_disbursement']+a['background_financing']+a['owner_injection']+a['asset_sale_inflow']-a['operating_cash_outflow']-a['debt_payment']-a['investment_outflow']-a['owner_draw']
        result['cash_frozen_with_nonzero_net_flow_months']+=int(((np.abs(a['cash_balance']-a['opening_balance'])<1e-6)&(np.abs(net)>1e-4)).sum())
    assert result['cash_frozen_with_nonzero_net_flow_months']==0
    result['generator_version']=manifest['generator_version'];result['source_sha256']=manifest['source_sha256']
    (root/'cash_plateau_check.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2));return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('dataset',type=Path);check(p.parse_args().dataset)
