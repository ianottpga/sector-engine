"""
Walk-forward backtest of the bias and sector-ranking signals.

At every month-end the engine sees only data up to that date, makes its call, and the
call is scored against what SPY and the sectors did over the next 21 and 63 trading days.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine import BENCHMARK, D30, D90, SECTOR_ETFS, Config, market_bias, sector_scores

BUCKETS = [(-999, -40), (-40, -20), (-20, 0), (0, 20), (20, 40), (40, 999)]


def _bucket_label(lo: float, hi: float) -> str:
    if lo == -999:
        return f"below {hi}"
    if hi == 999:
        return f"{lo} and above"
    return f"{lo} to {hi}"


def run_backtest(close: pd.DataFrame, nfci: pd.Series | None = None, cfg: Config = Config(),
                 min_history: int = 260) -> dict:
    idx = close.index
    month_ends = pd.Series(idx, index=idx).groupby([idx.year, idx.month]).last().tolist()
    rows = []
    for d in month_ends:
        i = idx.get_loc(d)
        if i < min_history or i + D30 >= len(idx):
            continue
        hist = close.iloc[: i + 1]
        if hist[[t for t in SECTOR_ETFS if t in hist]].iloc[-1].notna().sum() < 8:
            continue
        n_hist = nfci.loc[: d - pd.Timedelta(days=7)] if nfci is not None else None  # 1-week release lag
        bias = market_bias(hist, n_hist, cfg)
        secs = sector_scores(hist, bias["score"], cfg)

        p0 = close.iloc[i]
        f21 = close.iloc[i + D30] / p0 - 1
        f63 = close.iloc[i + D90] / p0 - 1 if i + D90 < len(idx) else pd.Series(np.nan, index=close.columns)
        top3 = [s["ticker"] for s in secs[:3]]
        bot3 = [s["ticker"] for s in secs[-3:]]
        all_s = [s["ticker"] for s in secs]
        rows.append({
            "date": d.strftime("%Y-%m-%d"),
            "score": bias["score"], "label": bias["label"], "confidence": bias["confidence"],
            "spy21": f21[BENCHMARK], "spy63": f63[BENCHMARK],
            "top3": ",".join(top3),
            "top3_21": f21[top3].mean(), "bot3_21": f21[bot3].mean(), "all_21": f21[all_s].mean(),
            "top3_63": f63[top3].mean(),
        })

    df = pd.DataFrame(rows)
    if df.empty:
        return {"error": "Not enough history to backtest"}

    def hit(sub, col):
        sub = sub.dropna(subset=[col])
        if sub.empty:
            return None
        sign = np.where(sub["label"] == "Bullish", 1, -1)
        return round(float((np.sign(sub[col]) == sign).mean() * 100), 1)

    directional = df[df["label"] != "Neutral"]
    buckets = []
    for lo, hi in BUCKETS:
        sub = df[(df["score"] >= lo) & (df["score"] < hi)]
        if sub.empty:
            continue
        s63 = sub["spy63"].dropna()
        buckets.append({
            "bucket": _bucket_label(lo, hi),
            "lo": lo, "hi": hi, "n": int(len(sub)),
            "pctUp21": round(float((sub["spy21"] > 0).mean() * 100), 1),
            "pctUp63": round(float((s63 > 0).mean() * 100), 1) if len(s63) else None,
            "avg21": round(float(sub["spy21"].mean() * 100), 2),
            "avg63": round(float(s63.mean() * 100), 2) if len(s63) else None,
        })

    by_label = []
    for lab in ["Bullish", "Neutral", "Bearish"]:
        sub = df[df["label"] == lab]
        if len(sub):
            by_label.append({
                "label": lab, "n": int(len(sub)),
                "avg21": round(float(sub["spy21"].mean() * 100), 2),
                "avg63": round(float(sub["spy63"].dropna().mean() * 100), 2),
                "pctUp63": round(float((sub["spy63"].dropna() > 0).mean() * 100), 1),
            })

    ex = df["top3_21"] - df["spy21"]
    eq = pd.DataFrame({
        "date": df["date"],
        "top3": (1 + df["top3_21"]).cumprod(),
        "spy": (1 + df["spy21"]).cumprod(),
        "equalWeight": (1 + df["all_21"]).cumprod(),
    })
    years = len(df) / 12
    def cagr(x):
        return round(float((x.iloc[-1] ** (1 / years) - 1) * 100), 2) if years > 0 else None

    return {
        "start": df["date"].iloc[0], "end": df["date"].iloc[-1], "months": int(len(df)),
        "bias": {
            "hitRate21": hit(directional, "spy21"),
            "hitRate63": hit(directional, "spy63"),
            "directionalCalls": int(len(directional)),
            "byLabel": by_label,
            "buckets": buckets,
        },
        "sectors": {
            "top3AvgExcess21": round(float(ex.mean() * 100), 2),
            "top3WinRate21": round(float((ex > 0).mean() * 100), 1),
            "topMinusBottom21": round(float((df["top3_21"] - df["bot3_21"]).mean() * 100), 2),
            "cagrTop3": cagr(eq["top3"]), "cagrSpy": cagr(eq["spy"]), "cagrEqualWeight": cagr(eq["equalWeight"]),
        },
        "equity": [{"date": r.date, "top3": round(r.top3, 4), "spy": round(r.spy, 4),
                    "equalWeight": round(r.equalWeight, 4)} for r in eq.itertuples()],
        "calls": df.tail(36).assign(
            spy21=lambda x: (x.spy21 * 100).round(2), spy63=lambda x: (x.spy63 * 100).round(2),
            top3_21=lambda x: (x.top3_21 * 100).round(2),
        )[["date", "score", "label", "confidence", "top3", "spy21", "spy63", "top3_21"]]
         .replace({np.nan: None}).to_dict("records"),
        "notes": [
            "Monthly rebalance, no transaction costs, taxes or slippage.",
            "Sector ETFs with short histories (XLC from 2018, XLRE from 2015) join when they have 260 days of data.",
            "Thresholds and weights were chosen a priori, not optimized on this sample, but results are still in-sample for the chosen design.",
        ],
    }


def calibrated_confidence(backtest: dict, score: float, label: str) -> dict | None:
    """Historical frequency that the current call was right, for the current score bucket."""
    for b in backtest.get("bias", {}).get("buckets", []):
        if b["lo"] <= score < b["hi"] and b.get("pctUp63") is not None:
            p = b["pctUp63"] if label != "Bearish" else round(100 - b["pctUp63"], 1)
            return {"bucket": b["bucket"], "n": b["n"], "historicalHitRate63": p,
                    "avgSpy63": b["avg63"]}
    return None
