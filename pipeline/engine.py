"""
Sector Rotation Engine: signal library.

Pure functions over aligned daily price frames (DatetimeIndex rows, ticker columns).
Every function takes data *up to and including* the evaluation date only, so the
same code drives both the live daily run and the walk-forward backtest.

Extends the original 30/90-day relative-strength script with:
  * a 7-factor market bias score (-100..+100) with confidence
  * a 4-factor sector score (relative strength, risk-adjusted RS, trend, regime fit)
  * RRG-style rotation quadrants
  * trade-idea formatting with pivot / ATR levels
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------------------
# Universe
# --------------------------------------------------------------------------------------
BENCHMARK = "SPY"

# Morningstar super-sector grouping (Cyclical / Sensitive / Defensive)
SECTORS = {
    "XLK": ("Technology", "Sensitive"),
    "XLC": ("Communication Services", "Sensitive"),
    "XLI": ("Industrials", "Sensitive"),
    "XLE": ("Energy", "Sensitive"),
    "XLF": ("Financials", "Cyclical"),
    "XLY": ("Consumer Discretionary", "Cyclical"),
    "XLB": ("Materials", "Cyclical"),
    "XLRE": ("Real Estate", "Cyclical"),
    "XLV": ("Health Care", "Defensive"),
    "XLP": ("Consumer Staples", "Defensive"),
    "XLU": ("Utilities", "Defensive"),
}
SECTOR_ETFS = list(SECTORS)

# Supporting market internals
VIX, VIX3M = "^VIX", "^VIX3M"
HY, TSY = "HYG", "IEF"          # credit risk appetite: high yield vs 7-10y Treasuries
EQUAL_WEIGHT = "RSP"            # equal-weight S&P 500 for breadth
AUX = [VIX, VIX3M, HY, TSY, EQUAL_WEIGHT]

ALL_TICKERS = [BENCHMARK] + SECTOR_ETFS + AUX

# Trading-day windows (the original script's approximations)
D30, D90 = 21, 63

# Group sensitivity to the market regime, used for "macro alignment"
GROUP_BETA = {"Cyclical": 1.0, "Sensitive": 0.75, "Defensive": -1.0}


@dataclass
class Config:
    w30: float = 0.40              # weight on 30-day relative strength (original script)
    w90: float = 0.60              # weight on 90-day relative strength (original script)
    bull_threshold: float = 20.0
    bear_threshold: float = -20.0
    factor_weights: dict | None = None

    def weights(self) -> dict:
        return self.factor_weights or {
            "trend": 0.20,
            "momentum": 0.15,
            "breadth": 0.20,
            "risk_appetite": 0.15,
            "volatility": 0.10,
            "credit": 0.15,
            "financial_conditions": 0.05,
        }


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
def _ret(s: pd.Series, n: int) -> float:
    s = s.dropna()
    if len(s) <= n:
        return float("nan")
    return float(s.iloc[-1] / s.iloc[-1 - n] - 1)


def _sma(s: pd.Series, n: int) -> float:
    s = s.dropna()
    return float(s.iloc[-n:].mean()) if len(s) >= n else float("nan")


def _squash(x: float, scale: float) -> float:
    """Map an unbounded reading to [-1, 1]. `scale` is the value that maps to ~0.76."""
    if x is None or not np.isfinite(x):
        return float("nan")
    return math.tanh(x / scale)


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> float:
    df = pd.concat([high, low, close], axis=1, keys=["h", "l", "c"]).dropna()
    if len(df) < n + 1:
        return float("nan")
    prev = df["c"].shift(1)
    tr = pd.concat([df["h"] - df["l"], (df["h"] - prev).abs(), (df["l"] - prev).abs()], axis=1).max(axis=1)
    return float(tr.iloc[-n:].mean())


def _ann_vol(s: pd.Series, n: int = D90) -> float:
    r = s.dropna().pct_change().iloc[-n:]
    return float(r.std() * math.sqrt(252)) if len(r) >= n // 2 else float("nan")


def _r(x, d=2):
    return None if x is None or not np.isfinite(x) else round(float(x), d)


# --------------------------------------------------------------------------------------
# 1. Market bias (30-90 day)
# --------------------------------------------------------------------------------------
def market_factors(close: pd.DataFrame, nfci: pd.Series | None = None) -> dict:
    """Seven factor readings, each in [-1, 1]. Positive = supportive of equities."""
    spy = close[BENCHMARK].dropna()
    f, raw = {}, {}

    # Trend: SPY vs its 200-day average, and the slope of the 50-day average
    sma200, sma50 = _sma(spy, 200), _sma(spy, 50)
    sma50_prev = _sma(spy.iloc[:-D30], 50) if len(spy) > 50 + D30 else float("nan")
    dist200 = spy.iloc[-1] / sma200 - 1
    slope50 = sma50 / sma50_prev - 1
    f["trend"] = np.nanmean([_squash(dist200, 0.04), _squash(slope50, 0.02)])
    raw["trend"] = f"SPY {dist200:+.1%} vs 200-day; 50-day slope {slope50:+.1%}/mo"

    # Momentum: time-series momentum over 21 and 63 days
    r21, r63 = _ret(spy, D30), _ret(spy, D90)
    f["momentum"] = 0.4 * _squash(r21, 0.03) + 0.6 * _squash(r63, 0.06)
    raw["momentum"] = f"SPY {r21:+.1%} (21d), {r63:+.1%} (63d)"

    # Breadth: share of sectors above 50-day, share with positive 63d return,
    # and equal-weight vs cap-weight (narrow vs broad rally)
    sec = [t for t in SECTOR_ETFS if t in close and close[t].dropna().shape[0] > 63]
    above50 = np.mean([close[t].dropna().iloc[-1] > _sma(close[t], 50) for t in sec])
    pos63 = np.mean([_ret(close[t], D90) > 0 for t in sec])
    parts = [(above50 - 0.5) * 2, (pos63 - 0.5) * 2]
    ew_note = ""
    if EQUAL_WEIGHT in close and close[EQUAL_WEIGHT].dropna().shape[0] > D90:
        ew = _ret(close[EQUAL_WEIGHT], D90) - r63
        parts.append(_squash(ew, 0.03))
        ew_note = f"; RSP vs SPY {ew:+.1%}"
    f["breadth"] = float(np.nanmean(parts))
    raw["breadth"] = f"{above50:.0%} of sectors above 50-day, {pos63:.0%} up over 63d{ew_note}"

    # Risk appetite: cyclicals vs defensives, 63-day
    cyc = [t for t in sec if SECTORS[t][1] == "Cyclical"]
    dfn = [t for t in sec if SECTORS[t][1] == "Defensive"]
    spread = np.nanmean([_ret(close[t], D90) for t in cyc]) - np.nanmean([_ret(close[t], D90) for t in dfn])
    f["risk_appetite"] = _squash(spread, 0.04)
    raw["risk_appetite"] = f"Cyclicals minus defensives {spread:+.1%} (63d)"

    # Volatility: VIX level and term structure (VIX3M/VIX > 1 = calm contango)
    if VIX in close and close[VIX].dropna().shape[0]:
        vix = float(close[VIX].dropna().iloc[-1])
        parts = [_squash(20 - vix, 6)]
        note = f"VIX {vix:.1f}"
        if VIX3M in close and close[VIX3M].dropna().shape[0]:
            term = float(close[VIX3M].dropna().iloc[-1]) / vix - 1
            parts.append(_squash(term, 0.08))
            note += f"; VIX3M/VIX {term + 1:.2f}"
        f["volatility"] = float(np.nanmean(parts))
        raw["volatility"] = note

    # Credit: high yield vs Treasuries, 63-day relative change
    if HY in close and TSY in close:
        ratio = (close[HY] / close[TSY]).dropna()
        cr = _ret(ratio, D90)
        f["credit"] = _squash(cr, 0.025)
        raw["credit"] = f"HYG/IEF {cr:+.1%} (63d)"

    # Financial conditions: Chicago Fed NFCI (negative = looser than average)
    if nfci is not None and nfci.dropna().shape[0] > 14:
        n = nfci.dropna()
        lvl, chg = float(n.iloc[-1]), float(n.iloc[-1] - n.iloc[-14])
        f["financial_conditions"] = 0.5 * _squash(-lvl, 0.4) + 0.5 * _squash(-chg, 0.1)
        raw["financial_conditions"] = f"NFCI {lvl:+.2f}, 13-week change {chg:+.2f}"

    return {k: (float(v), raw[k]) for k, v in f.items() if np.isfinite(v)}


def market_bias(close: pd.DataFrame, nfci: pd.Series | None = None, cfg: Config = Config()) -> dict:
    factors = market_factors(close, nfci)
    w = {k: v for k, v in cfg.weights().items() if k in factors}
    tot = sum(w.values())
    score = 100 * sum(w[k] * factors[k][0] for k in w) / tot

    if score >= cfg.bull_threshold:
        label = "Bullish"
    elif score <= cfg.bear_threshold:
        label = "Bearish"
    else:
        label = "Neutral"

    # Model confidence: strength of the score blended with factor agreement.
    if label == "Neutral":
        agreement = sum(w[k] for k in w if abs(factors[k][0]) < 0.35) / tot
        strength = 1 - abs(score) / max(cfg.bull_threshold, 1)
    else:
        sign = 1 if label == "Bullish" else -1
        agreement = sum(w[k] for k in w if np.sign(factors[k][0]) == sign) / tot
        strength = min(1.0, abs(score) / 60)
    confidence = round(100 * (0.55 * strength + 0.45 * agreement))

    return {
        "score": round(score, 1),
        "label": label,
        "confidence": int(confidence),
        "agreement": round(agreement, 2),
        "factors": [
            {"key": k, "reading": round(factors[k][0], 3), "weight": round(w[k] / tot, 3),
             "contribution": round(100 * w[k] * factors[k][0] / tot, 1), "detail": factors[k][1]}
            for k in w
        ],
    }


# --------------------------------------------------------------------------------------
# 2. Sector ranking
# --------------------------------------------------------------------------------------
def _z(values: dict) -> dict:
    arr = np.array([v for v in values.values() if np.isfinite(v)])
    mu, sd = (arr.mean(), arr.std()) if len(arr) > 1 else (0.0, 1.0)
    sd = sd or 1.0
    return {k: (v - mu) / sd if np.isfinite(v) else 0.0 for k, v in values.items()}


def rotation_quadrant(rs30: float, rs90: float) -> str:
    if rs90 >= 0 and rs30 >= 0:
        return "Leading"
    if rs90 >= 0 and rs30 < 0:
        return "Weakening"
    if rs90 < 0 and rs30 < 0:
        return "Lagging"
    return "Improving"


def sector_scores(close: pd.DataFrame, bias_score: float, cfg: Config = Config()) -> list[dict]:
    spy30, spy90 = _ret(close[BENCHMARK], D30), _ret(close[BENCHMARK], D90)
    rows = {}
    for t in SECTOR_ETFS:
        if t not in close or close[t].dropna().shape[0] <= D90:
            continue
        s = close[t].dropna()
        r30, r90 = _ret(s, D30), _ret(s, D90)
        rs30, rs90 = r30 - spy30, r90 - spy90
        vol = _ann_vol(s)
        last, s50, s200 = s.iloc[-1], _sma(s, 50), _sma(s, 200)
        if np.isfinite(s200):
            trend = (1.0 if last > s50 else -1.0) * 0.5 + (0.5 if s50 > s200 else -0.5)
        else:
            trend = 1.0 if last > s50 else -1.0
        rows[t] = dict(
            ticker=t, name=SECTORS[t][0], group=SECTORS[t][1],
            r30=r30, r90=r90, rs30=rs30, rs90=rs90, vol=vol,
            composite=cfg.w30 * rs30 + cfg.w90 * rs90,          # the original script's score
            risk_adj=(rs90 * 4) / vol if vol else float("nan"),  # annualized excess / vol
            trend=trend,
            fit=GROUP_BETA[SECTORS[t][1]] * bias_score / 100,
        )

    zc = _z({k: v["composite"] for k, v in rows.items()})
    zr = _z({k: v["risk_adj"] for k, v in rows.items()})
    out = []
    for t, v in rows.items():
        score = 0.45 * zc[t] + 0.20 * zr[t] + 0.20 * v["trend"] + 0.15 * v["fit"] * 1.5
        out.append({
            "ticker": t, "name": v["name"], "group": v["group"],
            "ret30": _r(v["r30"] * 100), "ret90": _r(v["r90"] * 100),
            "vsSpy30": _r(v["rs30"] * 100), "vsSpy90": _r(v["rs90"] * 100),
            "composite": _r(v["composite"] * 100, 3),
            "volatility": _r(v["vol"] * 100, 1),
            "riskAdjusted": _r(v["risk_adj"]),
            "trend": v["trend"],
            "regimeFit": _r(v["fit"]),
            "score": _r(score, 3),
            "quadrant": rotation_quadrant(v["rs30"], v["rs90"]),
        })
    out.sort(key=lambda d: d["score"], reverse=True)
    for i, d in enumerate(out, 1):
        d["rank"] = i
    return out


# --------------------------------------------------------------------------------------
# 3. Levels and trade ideas
# --------------------------------------------------------------------------------------
def key_levels(close: pd.Series, high: pd.Series, low: pd.Series) -> dict:
    c = close.dropna()
    last = float(c.iloc[-1])
    atr = _atr(high, low, close)
    win_h = float(high.dropna().iloc[-D30:].max())
    win_l = float(low.dropna().iloc[-D30:].min())
    pivot = (win_h + win_l + last) / 3          # monthly floor-trader pivot
    return {
        "last": _r(last), "atr14": _r(atr),
        "sma20": _r(_sma(c, 20)), "sma50": _r(_sma(c, 50)), "sma200": _r(_sma(c, 200)),
        "pivot": _r(pivot), "r1": _r(2 * pivot - win_l), "s1": _r(2 * pivot - win_h),
        "high63": _r(float(high.dropna().iloc[-D90:].max())),
        "low63": _r(float(low.dropna().iloc[-D90:].min())),
    }


def _idea(sec: dict, lv: dict, side: str, why: str) -> dict:
    atr = lv["atr14"] or 0
    if side == "Long":
        stop = lv["last"] - 2 * atr
        entry = [round(max(lv["sma20"] or lv["last"], lv["last"] - atr), 2), lv["last"]]
        target = max(lv["r1"] or 0, lv["last"] + 3 * atr)
    else:
        stop = lv["last"] + 2 * atr
        entry = [lv["last"], round(min(lv["sma20"] or lv["last"], lv["last"] + atr), 2)]
        target = min(lv["s1"] or 1e9, lv["last"] - 3 * atr)
    risk = abs(lv["last"] - stop)
    return {
        "ticker": sec["ticker"], "name": sec["name"], "side": side, "why": why,
        "score": sec["score"], "quadrant": sec["quadrant"],
        "entry": entry, "stop": _r(stop), "target": _r(target),
        "rewardRisk": _r(abs(target - lv["last"]) / risk if risk else float("nan"), 1),
        "levels": lv,
    }


def trade_ideas(sectors: list[dict], bias: dict, close, high, low) -> dict:
    lv = {s["ticker"]: key_levels(close[s["ticker"]], high[s["ticker"]], low[s["ticker"]]) for s in sectors}
    longs = [s for s in sectors if s["trend"] >= 0][:3] or sectors[:3]
    ideas = [_idea(s, lv[s["ticker"]], "Long",
                   f"Rank #{s['rank']}, {s['quadrant'].lower()}, {s['vsSpy90']:+.1f}% vs SPY over 90d")
             for s in longs]

    defensives = [s for s in sectors if s["group"] == "Defensive"]
    weakest = sectors[-1]
    if bias["label"] == "Bearish":
        hedge = _idea(defensives[0], lv[defensives[0]["ticker"]], "Long",
                      "Bearish regime: strongest defensive sector as ballast; consider trimming beta or an index hedge")
    elif bias["label"] == "Neutral":
        hedge = _idea(defensives[0], lv[defensives[0]["ticker"]], "Long",
                      "Neutral regime: hold the strongest defensive sector to balance the longs")
    else:
        hedge = _idea(weakest, lv[weakest["ticker"]], "Underweight",
                      f"Weakest sector (rank #{weakest['rank']}); funding source or pair-trade short")
    return {"longs": ideas, "hedge": hedge}


# --------------------------------------------------------------------------------------
# 4. One-shot snapshot for a given date
# --------------------------------------------------------------------------------------
def snapshot(close, high, low, nfci=None, cfg: Config = Config()) -> dict:
    bias = market_bias(close, nfci, cfg)
    sectors = sector_scores(close, bias["score"], cfg)
    spy = close[BENCHMARK]
    return {
        "asOf": close.index[-1].strftime("%Y-%m-%d"),
        "bias": bias,
        "benchmark": {
            "ticker": BENCHMARK,
            "ret30": _r(_ret(spy, D30) * 100), "ret90": _r(_ret(spy, D90) * 100),
            "levels": key_levels(spy, high[BENCHMARK], low[BENCHMARK]),
        },
        "sectors": sectors,
        "ideas": trade_ideas(sectors, bias, close, high, low),
        "config": {"w30": cfg.w30, "w90": cfg.w90,
                   "bull": cfg.bull_threshold, "bear": cfg.bear_threshold},
    }
