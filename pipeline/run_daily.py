"""
Daily pipeline: fetch closes -> run engine -> backtest -> write dashboard JSON.

    python run_daily.py                 # live data (Yahoo Finance + FRED)
    python run_daily.py --sample        # synthetic prices, for offline testing only

Outputs (relative to repo root):
    web/public/data/latest.json     today's snapshot, bias history, live track record
    web/public/data/backtest.json   walk-forward backtest
    history/signals.csv             append-only log of every daily call (forward test)
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from backtest import calibrated_confidence, run_backtest
from engine import ALL_TICKERS, BENCHMARK, D30, D90, SECTOR_ETFS, SECTORS, Config, market_bias, snapshot

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data"
HIST = ROOT / "history" / "signals.csv"


# --------------------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------------------
def fetch_prices(years: int = 20):
    import yfinance as yf
    raw = yf.download(ALL_TICKERS, period=f"{years}y", interval="1d",
                      auto_adjust=True, progress=False, group_by="column", threads=True)
    close, high, low = raw["Close"], raw["High"], raw["Low"]
    close = close.dropna(subset=[BENCHMARK])
    if close.empty:
        raise RuntimeError("No SPY data returned; aborting so stale JSON is not overwritten.")
    return close, high.reindex(close.index), low.reindex(close.index)


def fetch_nfci() -> pd.Series | None:
    """Chicago Fed National Financial Conditions Index (weekly). No API key needed."""
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=NFCI"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            df = pd.read_csv(io.StringIO(r.read().decode()))
        df.columns = ["date", "NFCI"]
        s = pd.to_numeric(df.set_index(pd.to_datetime(df["date"]))["NFCI"], errors="coerce")
        return s.dropna()
    except Exception as e:  # macro factor is optional; engine reweights without it
        print(f"warning: NFCI fetch failed ({e}); continuing without it", file=sys.stderr)
        return None


def sample_prices(days: int = 2600, seed: int = 7):
    """Synthetic but structured prices: a market factor with regime shifts plus sector betas."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=days)
    regime = np.repeat(rng.choice([0.0009, 0.0003, -0.0007], size=days // 60 + 1, p=[.5, .3, .2]), 60)[:days]
    mkt = regime + rng.normal(0, 0.010, days) * (1 + (regime < 0) * 0.8)
    betas = {"XLK": 1.25, "XLC": 1.1, "XLI": 1.05, "XLE": 0.9, "XLF": 1.15, "XLY": 1.2,
             "XLB": 1.0, "XLRE": 0.95, "XLV": 0.7, "XLP": 0.55, "XLU": 0.5}
    drift = {t: rng.normal(0, 0.00015) for t in betas}
    data = {BENCHMARK: mkt}
    for t, b in betas.items():
        trend = np.repeat(rng.normal(0, 0.0004, days // 90 + 1), 90)[:days]
        data[t] = b * mkt + drift[t] + trend + rng.normal(0, 0.007, days)
    data["RSP"] = 0.95 * mkt + rng.normal(0, 0.003, days)
    data["HYG"] = 0.3 * mkt + rng.normal(0, 0.003, days)
    data["IEF"] = -0.15 * mkt + rng.normal(0, 0.003, days)
    rets = pd.DataFrame(data, index=idx)
    close = 100 * (1 + rets).cumprod()
    start = {"SPY": 580, "XLK": 240, "XLC": 105, "XLI": 140, "XLE": 90, "XLF": 50, "XLY": 215,
             "XLB": 88, "XLRE": 42, "XLV": 145, "XLP": 80, "XLU": 82, "RSP": 185, "HYG": 80, "IEF": 95}
    close = close / close.iloc[0] * pd.Series(start)
    vix = pd.Series(16 - 400 * pd.Series(mkt, index=idx).rolling(10).mean().fillna(0)
                    + rng.normal(0, 1.2, days), index=idx).clip(10, 60)
    close["^VIX"], close["^VIX3M"] = vix, vix * 1.06 + 0.5
    noise = np.abs(rng.normal(0, 0.006, close.shape))
    high, low = close * (1 + noise), close * (1 - noise)
    nfci = pd.Series(-0.45 + np.cumsum(rng.normal(0, 0.01, days)) * 0.3, index=idx).resample("W-FRI").last()
    return close, high, low, nfci


# --------------------------------------------------------------------------------------
# Live track record (forward test of the daily calls)
# --------------------------------------------------------------------------------------
def update_track_record(snap: dict, close: pd.DataFrame, persist: bool) -> dict:
    row = {
        "date": snap["asOf"], "score": snap["bias"]["score"], "label": snap["bias"]["label"],
        "confidence": snap["bias"]["confidence"],
        "top3": ",".join(s["ticker"] for s in snap["sectors"][:3]),
        "spy_close": snap["benchmark"]["levels"]["last"],
    }
    log = pd.read_csv(HIST) if HIST.exists() else pd.DataFrame(columns=list(row))
    log = log[log["date"] != row["date"]]
    log = pd.concat([log, pd.DataFrame([row])], ignore_index=True)
    if persist:
        HIST.parent.mkdir(parents=True, exist_ok=True)
        log.to_csv(HIST, index=False)

    idx = close.index.strftime("%Y-%m-%d")
    pos = {d: i for i, d in enumerate(idx)}
    graded = []
    for r in log.itertuples():
        i = pos.get(r.date)
        if i is None:
            continue
        out = {"date": r.date, "score": r.score, "label": r.label, "top3": r.top3}
        for n, key in [(D30, "spy21"), (D90, "spy63")]:
            out[key] = round(float(close[BENCHMARK].iloc[i + n] / close[BENCHMARK].iloc[i] - 1) * 100, 2) \
                if i + n < len(close) else None
        graded.append(out)

    done = [g for g in graded if g["spy21"] is not None and g["label"] != "Neutral"]
    hits = [(g["spy21"] > 0) == (g["label"] == "Bullish") for g in done]
    return {
        "daysLogged": len(log),
        "gradedCalls21": len(done),
        "hitRate21": round(100 * sum(hits) / len(hits), 1) if hits else None,
        "recent": graded[-30:][::-1],
    }


# --------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true", help="use synthetic prices (offline test)")
    ap.add_argument("--w30", type=float, default=0.40)
    ap.add_argument("--w90", type=float, default=0.60)
    args = ap.parse_args()

    cfg = Config(w30=args.w30, w90=args.w90)
    if args.sample:
        close, high, low, nfci = sample_prices()
    else:
        close, high, low = fetch_prices()
        nfci = fetch_nfci()

    snap = snapshot(close, high, low, nfci, cfg)

    # Daily bias history for the last ~6 months (chart on the summary page)
    hist = []
    for i in range(max(260, len(close) - 126), len(close)):
        d = close.index[i]
        n = nfci.loc[: d - pd.Timedelta(days=7)] if nfci is not None else None
        b = market_bias(close.iloc[: i + 1], n, cfg)
        hist.append({"date": d.strftime("%Y-%m-%d"), "score": b["score"],
                     "spy": round(float(close[BENCHMARK].iloc[i]), 2)})
    snap["biasHistory"] = hist

    bt = run_backtest(close, nfci, cfg)
    snap["bias"]["calibrated"] = calibrated_confidence(bt, snap["bias"]["score"], snap["bias"]["label"])
    snap["track"] = update_track_record(snap, close, persist=not args.sample)
    snap["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    snap["sample"] = bool(args.sample)
    snap["universe"] = {t: {"name": SECTORS[t][0], "group": SECTORS[t][1]} for t in SECTOR_ETFS}

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "latest.json").write_text(json.dumps(snap, indent=1, allow_nan=False, default=str))
    (OUT / "backtest.json").write_text(json.dumps(bt, indent=1, allow_nan=False, default=str))
    b = snap["bias"]
    print(f"{snap['asOf']}  bias {b['label']} {b['score']:+.1f} (confidence {b['confidence']})  "
          f"top 3: {', '.join(s['ticker'] for s in snap['sectors'][:3])}")


if __name__ == "__main__":
    main()
