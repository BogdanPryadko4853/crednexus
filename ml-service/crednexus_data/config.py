"""Scenario assumptions; not fitted Russian SME distributions or bank rules."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from crednexus_ml.history import MEASURES

# sector, weight, median monthly sales, goods share, fixed share, season amplitude,
# preferred peak month, credit-sales fraction, inventory coverage (months)
SECTORS = [
    ("retail", .24, 1_500_000, .65, .21, .22, 12, .08, 1.0),
    ("wholesale", .14, 3_500_000, .76, .11, .12, 11, .82, 1.3),
    ("food_service", .13, 1_000_000, .39, .46, .18, 7, .03, .12),
    ("professional_services", .15, 700_000, .23, .58, .08, 11, .72, 0.),
    ("construction", .10, 2_200_000, .55, .30, .36, 8, .85, .5),
    ("manufacturing", .10, 2_500_000, .57, .28, .14, 10, .78, 1.4),
    ("transport", .08, 1_300_000, .53, .33, .11, 9, .70, .1),
    ("hospitality", .06, 900_000, .30, .52, .45, 7, .22, .15),
]
STATES = {0: "active", 1: "distressed", 2: "restructuring", 3: "closed", 4: "not_started"}


@dataclass
class Config:
    companies: int = 100_000
    months: int = 96
    batch_size: int = 250
    seed: int = 20261021
    forecast_stride: int = 1
    missing_rate: float = .0015
    error_rate: float = .002
    stress_share: float = .10


def annuity(principal, annual_rate, term):
    r = np.asarray(annual_rate)/12
    return principal*r/(1-(1+r)**(-np.maximum(term, 1)))


def cohorts(months):
    """Mature 12-month labels before the next scoring cohort starts."""
    train_end = months-49
    validation_end = months-25
    return {"train": (23, train_end-12), "validation": (train_end, validation_end-12),
            "test": (validation_end, months-13), "stress_test": (validation_end, months-13)}


def macro_path(cfg):
    frames = []
    for world in range(4):
        rng = np.random.default_rng(np.random.SeedSequence([cfg.seed, 991, world]))
        t = np.arange(cfg.months)
        # Independent scenario paths: train / validation / test / OOD, not historical data.
        demand = np.exp(np.cumsum(rng.normal(.0002, .013, cfg.months)))
        for start in rng.integers(12, cfg.months-8, 3):
            length = int(rng.integers(4, 10))
            demand[start:start+length] *= rng.uniform(.80 if world<3 else .67, .94)
        sell_price = np.exp(np.cumsum(rng.normal(.0036, .0025, cfg.months)))
        input_cost = np.exp(np.cumsum(rng.normal(.0042, .0030, cfg.months)))
        wage_cost = np.exp(np.cumsum(rng.normal(.0038, .0017, cfg.months)))
        rate = np.clip(.13+.045*np.sin(t/11+world)+rng.normal(0, .009, cfg.months), .065, .245)
        frames.append(pd.DataFrame({"world": world, "month_idx": t,
                      "date": pd.date_range("2018-01-01", periods=cfg.months, freq="MS"),
                      "demand_index": demand, "price_index": sell_price, "input_cost_index": input_cost,
                      "wage_cost_index": wage_cost, "reference_rate": rate}))
    return pd.concat(frames, ignore_index=True)


def service_fifo(dues, available):
    before = np.cumsum(dues, axis=1)-dues
    paid = np.minimum(dues, np.maximum(available[:, None]-before, 0))
    dues -= paid
    return paid.sum(axis=1)
