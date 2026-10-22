"""Monthly aggregates shared by synthetic training data and online inference."""
import numpy as np

MEASURES = ("sales", "cash_inflow", "operating_cash_outflow", "cash_balance", "operating_expense")


def history_features(observed, rows, origins):
    """History before business birth / dataset start is missing, never negative indexing."""
    out = {}
    for key in MEASURES:
        data = observed[key]
        for lag in (0, 1, 2, 3, 6, 12):
            index = origins-lag
            out[f"{key}_lag_{lag}"] = np.where(index>=0, data[rows, np.maximum(index, 0)], np.nan)
        for window in (3, 6, 12):
            index = origins[:, None]-np.arange(window)[None, :]
            history = np.where(index>=0, data[rows[:, None], np.maximum(index, 0)], np.nan)
            count = np.isfinite(history).sum(axis=1)
            mean = np.divide(np.nansum(history, axis=1), count, out=np.full(len(rows), np.nan), where=count>0)
            variance = np.divide(np.nansum((history-mean[:, None])**2, axis=1), count,
                                 out=np.full(len(rows), np.nan), where=count>0)
            out[f"{key}_mean_{window}"] = mean
            out[f"{key}_std_{window}"] = np.sqrt(variance)
            if window==12:
                out[f"{key}_missing_fraction_12"] = 1-count/window
        previous = data[rows, np.maximum(origins-12, 0)]
        valid = (origins>=12)&(previous>0)
        out[f"{key}_yoy"] = np.divide(data[rows, origins], previous, out=np.full(len(rows), np.nan), where=valid)-1
    return out
