"""Generate v2 synthetic SME data, in bounded-size company batches."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import time

import numpy as np
import pandas as pd

from crednexus_ml.history import history_features
from crednexus_ml import history as shared_history

from . import __version__
from .config import Config, MEASURES, SECTORS, annuity, cohorts, macro_path, service_fifo
from .simulation import economy, observations


def write_table(root, table, part, frame):
    directory = root/table
    directory.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(directory/f"part-{part:05d}.parquet", index=False, compression="zstd")


def source_fingerprint():
    files = [Path(__file__), Path(__file__).with_name('config.py'), Path(__file__).with_name('simulation.py'), Path(shared_history.__file__)]
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def scoring_frames(companies, observed, truth, contract):
    n = len(companies)
    rows = np.arange(n)
    origin = contract['origin']
    future = origin[:, None]+np.arange(1, 13)
    past = np.maximum(origin[:, None]-np.arange(12), 0)
    dpd = truth['dpd']
    default90 = (dpd[rows[:, None], future]>=90).any(axis=1)
    restructuring = (truth['distressed_restructure'][rows[:, None], future]>0).any(axis=1)
    closure = (truth['closure_with_debt'][rows[:, None], future]>0).any(axis=1)
    target = default90|restructuring|closure
    meta = companies[['company_id', 'split']].copy()
    meta['application_id'] = 'APP2-'+companies.company_id
    meta['as_of_month_idx'] = origin
    features = meta.copy()
    for key in ('sector', 'legal_form', 'largest_customer_share', 'largest_channel_share'):
        features[key] = companies[key]
    features['business_age_months'] = origin-companies.birth_month_idx+companies.age_at_start_months+1
    for key, source in [('requested_amount','amount'), ('term_months','term'), ('annual_rate','rate'), ('purpose','purpose'), ('product_limit','product_limit')]:
        features[key] = contract[source]
    features['proposed_monthly_payment'] = annuity(contract['amount'], np.maximum(contract['rate'], .001), contract['term'])
    features = pd.concat([features, pd.DataFrame(history_features(observed, rows, origin))], axis=1)
    for key in ('accounts_receivable', 'accounts_payable', 'overdue_payables', 'debt_outstanding', 'loan_arrears', 'inventory', 'business_state'):
        features[key] = truth[key][rows, origin]
    features['bureau_dpd_current'] = dpd[rows, origin]
    features['bureau_dpd_max_12'] = dpd[rows[:, None], past].max(axis=1)
    features['bureau_overdue_months_12'] = (dpd[rows[:, None], past]>0).sum(axis=1)
    features['existing_monthly_debt_service'] = truth['scheduled_debt_payment'][rows, origin]
    features['cash_flow_coverage'] = (features.cash_inflow_mean_6-features.operating_cash_outflow_mean_6)/np.maximum(
        features.existing_monthly_debt_service+features.proposed_monthly_payment, 1)
    labels = meta.copy()
    labels['default_next12m'] = target.astype(np.int8)
    labels['default_90dpd_next12m'] = default90.astype(np.int8)
    labels['distressed_restructure_next12m'] = restructuring.astype(np.int8)
    labels['closure_with_debt_next12m'] = closure.astype(np.int8)
    labels['label_end_month_idx'] = origin+12
    outcomes = labels.copy()
    outcomes['eligible_at_origin'] = contract['eligible']
    outcomes['funded'] = contract['funded']
    outcomes['future_max_dpd'] = dpd[rows[:, None], future].max(axis=1)
    eligible = contract['eligible']
    return features[eligible].reset_index(drop=True), labels[eligible].reset_index(drop=True), outcomes


def forecast_frames(companies, observed, truth, cfg):
    n = len(companies)
    samples = []
    train_boundary, validation_boundary = cfg.months-49, cfg.months-25
    for origin in range(23, cfg.months-3, cfg.forecast_stride):
        for horizon in (1, 2, 3):
            target = origin+horizon
            if target<=train_boundary:
                period = 'train'
            elif origin>=train_boundary and target<=validation_boundary:
                period = 'validation'
            elif origin>=validation_boundary:
                period = 'test'
            else:
                continue
            selection = companies.split.eq(period).to_numpy() if period!='test' else companies.split.isin(['test','stress_test']).to_numpy()
            # A forecast exists only for a currently operating company with >=3 months of history.
            selection &= (truth['business_state'][:, origin]<3)&(origin-companies.birth_month_idx.to_numpy()>=2)
            rows = np.flatnonzero(selection)
            if not len(rows):
                continue
            samples.append((rows, np.full(len(rows), origin), np.full(len(rows), horizon), np.full(len(rows), period)))
    rows = np.concatenate([s[0] for s in samples]) if samples else np.array([], dtype=int)
    origins = np.concatenate([s[1] for s in samples]) if samples else np.array([], dtype=int)
    horizons = np.concatenate([s[2] for s in samples]) if samples else np.array([], dtype=int)
    periods = np.concatenate([s[3] for s in samples]) if samples else np.array([], dtype=str)
    target = origins+horizons
    selected = companies.iloc[rows].reset_index(drop=True)
    sample_id = selected.company_id+'-T'+pd.Series(origins).astype(str)+'-H'+pd.Series(horizons).astype(str)
    frame = pd.DataFrame({'sample_id': sample_id, 'company_id': selected.company_id, 'company_split': selected.split,
                          'time_split': periods, 'as_of_month_idx': origins, 'horizon': horizons, 'target_month_idx': target,
                          'target_month_of_year': target%12+1, 'as_of_month_of_year': origins%12+1,
                          'sector': selected.sector,
                          'business_age_months': origins-selected.birth_month_idx.to_numpy()+selected.age_at_start_months.to_numpy()+1})
    frame = pd.concat([frame, pd.DataFrame(history_features(observed, rows, origins))], axis=1)
    # All numeric feature columns use float32 except metadata: bounded training memory, money truth stays float64.
    for c in frame.select_dtypes(include='float64'):
        frame[c] = frame[c].astype('float32')
    labels = pd.DataFrame({'sample_id': sample_id, 'cash_inflow_target': truth['cash_inflow'][rows, target],
                          'operating_cash_outflow_target': truth['operating_cash_outflow'][rows, target]})
    labels['operating_net_cash_flow_target'] = labels.cash_inflow_target-labels.operating_cash_outflow_target
    return frame, labels


def simulate(cfg, part, first, count, macro, loan_amount_multiplier=1.):
    companies, params, truth, contract = economy(cfg, part, first, count, macro, loan_amount_multiplier)
    clean, observed, corrupted, normal_mask, corrupt_mask = observations(cfg, part, truth, companies.birth_month_idx.to_numpy())
    n, m = count, cfg.months
    common = {'company_id': np.repeat(companies.company_id.to_numpy(), m), 'month_idx': np.tile(np.arange(m), n),
              'date': np.tile(pd.date_range('2018-01-01', periods=m, freq='MS').to_numpy(), n), 'split': np.repeat(companies.split.to_numpy(), m)}
    def monthly(values):
        return pd.DataFrame(common|{key: array.ravel() for key, array in values.items()})
    audit = monthly(truth)
    audit['quality_error_mask'] = normal_mask.ravel()
    audit['corruption_mask'] = corrupt_mask.ravel()
    score, labels, outcomes = scoring_frames(companies, observed, truth, contract)
    forecast, targets = forecast_frames(companies, observed, truth, cfg)
    # Feature-equivalent stress table, paired by ID; never a training input by default.
    corrupted_score, _, _ = scoring_frames(companies, corrupted, truth, contract)
    return {'companies': companies, 'monthly_clean': monthly(clean), 'monthly_observed': monthly(observed),
            'monthly_corrupted': monthly(corrupted), 'audit/monthly_truth': audit, 'audit/company_parameters': params,
            'score_features': score, 'score_labels': labels, 'stress/score_features_corrupted': corrupted_score,
            'audit/credit_outcomes': outcomes, 'forecast_features': forecast, 'forecast_labels': targets}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('data/sme_100k_v2'))
    for name, value in asdict(Config()).items():
        parser.add_argument('--'+name.replace('_','-'), type=type(value), default=value)
    args = parser.parse_args()
    cfg = Config(**{name: getattr(args, name) for name in asdict(Config())})
    if cfg.companies<1 or cfg.batch_size<1 or cfg.months<96 or cfg.forecast_stride!=1:
        parser.error('positive companies/batch-size, months>=96 and forecast-stride=1 required')
    if any(not 0<=r<1 for r in (cfg.missing_rate, cfg.error_rate, cfg.stress_share)):
        parser.error('rates must be in [0,1)')
    if args.output.exists() and any(args.output.iterdir()):
        parser.error('output nonempty; choose new directory')
    args.output.mkdir(parents=True, exist_ok=True)
    macro = macro_path(cfg)
    write_table(args.output, 'macro', 0, macro)
    counts, schemas = {'macro': len(macro)}, {'macro': {c:str(t) for c,t in macro.dtypes.items()}}
    started = time.monotonic()
    for part, first in enumerate(range(0, cfg.companies, cfg.batch_size)):
        tables = simulate(cfg, part, first, min(cfg.batch_size, cfg.companies-first), macro)
        for table, frame in tables.items():
            write_table(args.output, table, part, frame)
            counts[table] = counts.get(table, 0)+len(frame)
            schemas[table] = {c:str(t) for c,t in frame.dtypes.items()}
        if part%10==0 or first+cfg.batch_size>=cfg.companies:
            print(f'{min(first+cfg.batch_size,cfg.companies):,}/{cfg.companies:,} companies; {time.monotonic()-started:.1f}s', flush=True)
    score_meta = {'company_id','application_id','split','as_of_month_idx'}
    forecast_meta = {'sample_id','company_id','company_split','time_split','as_of_month_idx','target_month_idx'}
    manifest = {'generator_version': __version__, 'config':asdict(cfg), 'rows':counts, 'schemas':schemas,
                'scoring_feature_columns':[c for c in schemas['score_features'] if c not in score_meta],
                'forecast_feature_columns':[c for c in schemas['forecast_features'] if c not in forecast_meta],
                'scoring_target':'default_next12m', 'secondary_scoring_target':'default_90dpd_next12m',
                'score_cohort_origins':cohorts(cfg.months), 'source_sha256':source_fingerprint(),
                'provenance':'Fully synthetic scenario economy; reference data not copied or fitted; not empirical Russian calibration.',
                'versions':{'numpy':np.__version__,'pandas':pd.__version__}}
    (args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(counts,indent=2),flush=True)


if __name__=='__main__':
    main()
