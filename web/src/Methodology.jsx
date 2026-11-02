import React from 'react';

const H = ({ n, children }) => (
  <h2 className="text-lg font-semibold text-slate-100 flex items-baseline gap-3 mt-2" style={{ textWrap: 'balance' }}>
    <span className="font-mono text-cyan-400 text-sm">{n}</span>{children}
  </h2>
);
const H3 = ({ children }) => <h3 className="text-sm font-semibold text-slate-200 mt-4">{children}</h3>;
const P = ({ children }) => <p className="text-sm text-slate-300 leading-relaxed max-w-[70ch]">{children}</p>;
const F = ({ children }) => (
  <pre className="font-mono text-[12px] leading-relaxed text-cyan-100 bg-slate-950/80 border border-slate-800 rounded-lg p-3 overflow-x-auto">{children}</pre>
);
const T = ({ head, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-xs">
      <thead><tr className="text-left text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
        {head.map((h) => <th key={h} className="p-2">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-800/60 text-slate-300">
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`p-2 align-top ${j === 0 ? 'font-mono text-cyan-300 whitespace-nowrap' : ''}`}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

export default function Methodology() {
  return (
    <article className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 md:p-8 flex flex-col gap-3">
      <p className="text-xs uppercase tracking-wider text-slate-400">Design specification</p>
      <h1 className="text-2xl font-bold" style={{ textWrap: 'balance' }}>How the engine works</h1>
      <P>
        This page documents the full framework: which signals the model uses, the exact formulas, where the data comes from,
        how the daily refresh runs, and how each output on the dashboard is built.
      </P>

      <H n="1">Strategy and methodology</H>
      <P>
        The core method comes from the original Python script: rank the eleven SPDR sector ETFs by their return in excess of SPY
        over roughly one month (21 trading days) and three months (63 trading days), then blend the two. That is classic
        cross-sectional sector momentum. The engine keeps that score intact and adds the two things a 30–90 day forecast needs
        and the script lacked: a read on the market's direction, and filters so a sector is not bought simply because it fell less.
      </P>
      <H3>Relative strength (unchanged from the script)</H3>
      <F>{`R_n(i)   = Close_t(i) / Close_{t-n}(i) - 1           n = 21, 63
RS_n(i)  = R_n(i) - R_n(SPY)
Composite(i) = w30 · RS_21(i) + w90 · RS_63(i)         default w30 = 0.40, w90 = 0.60`}</F>
      <H3>Market bias: seven factors, each mapped to −1…+1</H3>
      <P>Each raw reading is squashed with tanh(x / scale) so one extreme input cannot dominate.</P>
      <T head={['Factor', 'Weight', 'Rule', 'Why it matters for 1–3 months']} rows={[
        ['Trend', '20%', '½·tanh((SPY/SMA200 − 1)/4%) + ½·tanh(SMA50 21-day slope / 2%)', 'Markets above a rising 200-day trend have historically had better forward returns and smaller drawdowns.'],
        ['Momentum', '15%', '0.4·tanh(R21/3%) + 0.6·tanh(R63/6%)', 'Time-series momentum persists over 1–12 months.'],
        ['Breadth', '20%', 'Mean of: (share of sectors > 50-day − ½)·2, (share with R63 > 0 − ½)·2, tanh((R63 RSP − R63 SPY)/3%)', 'Broad participation confirms a rally; a narrow, cap-weighted rally is fragile.'],
        ['Risk appetite', '15%', 'tanh((avg R63 cyclicals − avg R63 defensives)/4%)', 'Investors rotate to staples, utilities and health care ahead of weakness.'],
        ['Volatility', '10%', '½·tanh((20 − VIX)/6) + ½·tanh((VIX3M/VIX − 1)/8%)', 'Inverted VIX term structure marks stress regimes.'],
        ['Credit', '15%', 'tanh(R63 of HYG/IEF / 2.5%)', 'High-yield spreads often widen before equities fall.'],
        ['Financial conditions', '5%', '½·tanh(−NFCI/0.4) + ½·tanh(−ΔNFCI 13w / 0.1)', 'Tight and tightening conditions are a macro headwind.'],
      ]} />
      <F>{`BiasScore = 100 · Σ wₖ·fₖ / Σ wₖ          (missing factors drop out and weights renormalize)
Bullish if BiasScore ≥ +20,  Bearish if ≤ −20,  otherwise Neutral`}</F>

      <H n="2">Data pipeline and daily refresh</H>
      <T head={['Source', 'Series', 'Cost', 'Use']} rows={[
        ['Yahoo Finance (yfinance)', 'SPY, 11 sector ETFs, RSP, HYG, IEF, ^VIX, ^VIX3M — daily OHLC, split/dividend adjusted', 'Free', 'Default. Fine for a personal tool; unofficial and occasionally rate-limited.'],
        ['FRED', 'NFCI (weekly). Optional: T10Y2Y, BAMLH0A0HYM2 high-yield spread, ICSA jobless claims', 'Free, no key for CSV', 'Macro factor. One-week release lag is applied in the backtest.'],
        ['Polygon.io / Alpaca', 'Same ETFs, official consolidated data', 'Paid tiers', 'Swap in for production or client-facing use; only fetch_prices() changes.'],
        ['Tiingo', 'Adjusted EOD prices', 'Low-cost', 'Good middle ground with a documented API and redistribution terms.'],
      ]} />
      <H3>Daily schedule</H3>
      <F>{`GitHub Actions cron  21:45 UTC Mon–Fri  (after the 4:00 pm ET close, either side of DST)
  │
  ├─ pipeline/run_daily.py
  │    fetch 20y OHLC (yfinance) + NFCI (FRED CSV)
  │    engine.snapshot()  → bias, sector scores, trade ideas, levels
  │    backtest.run_backtest()  → walk-forward monthly test
  │    append history/signals.csv  → live track record
  │    write web/public/data/latest.json, backtest.json
  │
  ├─ git commit data + history  (the repo is the database and the audit log)
  └─ build web/ (Vite) → deploy to GitHub Pages
       browser loads ./data/latest.json on open and on "Reload data"`}</F>
      <P>
        If the price download returns nothing, the run fails before writing, so the site keeps yesterday's data and marks it stale
        rather than showing a blank page. The header turns amber when the data is more than four days old.
      </P>

      <H n="3">Prediction engine</H>
      <H3>Market direction and confidence</H3>
      <P>
        The model reports two confidence numbers. Model confidence measures how strong and how unanimous today's reading is.
        Historical hit rate is the calibrated number: how often SPY moved in the called direction over the next 63 trading days
        when the score was in today's range during the backtest.
      </P>
      <F>{`Directional:  strength = min(1, |score| / 60)
              agreement = Σ weights of factors with the same sign as the call / Σ weights
Neutral:      strength  = 1 − |score| / 20
              agreement = Σ weights of factors with |fₖ| < 0.35 / Σ weights
ModelConfidence = 100 · (0.55·strength + 0.45·agreement)`}</F>
      <H3>Sector ranking</H3>
      <F>{`RiskAdj(i)  = (4 · RS_63(i)) / σ_63(i)                    annualized excess return per unit of volatility
Trend(i)    = ±0.5 (Close vs SMA50)  ±0.5 (SMA50 vs SMA200)  ∈ {−1, 0, +1}
RegimeFit(i)= β_group · BiasScore / 100     β: Cyclical +1, Sensitive +0.75, Defensive −1

EngineScore(i) = 0.45·z(Composite) + 0.20·z(RiskAdj) + 0.20·Trend + 0.225·RegimeFit
                 (z = cross-sectional z-score across the 11 sectors that day)

Phase:  RS_63 ≥ 0 & RS_21 ≥ 0 Leading   |  RS_63 ≥ 0 & RS_21 < 0 Weakening
        RS_63 < 0 & RS_21 < 0 Lagging   |  RS_63 < 0 & RS_21 ≥ 0 Improving`}</F>
      <H3>Trade setups</H3>
      <P>
        Longs are the top three sectors by engine score that are not in a downtrend. The hedge depends on the regime: the strongest
        defensive sector when the bias is Bearish or Neutral, and the weakest sector as an underweight when it is Bullish.
      </P>
      <F>{`ATR14     = 14-day average true range
Entry     = [max(SMA20, Close − 1·ATR), Close]
Stop      = Close − 2·ATR             (long)    Close + 2·ATR   (underweight)
Pivot     = (21d High + 21d Low + Close) / 3;   R1 = 2·Pivot − Low;   S1 = 2·Pivot − High
Target    = max(R1, Close + 3·ATR)    (long)    min(S1, Close − 3·ATR)
R:R       = |Target − Close| / |Close − Stop|`}</F>

      <H n="4">Pages and visuals</H>
      <T head={['Page', 'Answers', 'Key visuals']} rows={[
        ['Summary', 'Should I lean risk-on or risk-off for the next 1–3 months, and what would I buy?', 'Bias pill and gauge, two confidence measures, factor contribution bars, six-month bias history against SPY, SPY levels, four trade cards'],
        ['Leaderboard', 'Which sectors lead and how robust is the ranking?', 'Sortable table with the original weighted RS (live 30/90 slider) next to the engine score, 90-day excess bar chart'],
        ['Rotation', 'Where is each sector in its cycle?', 'RRG-style quadrant scatter with phase guide and members per phase'],
        ['Heatmap', 'What is helping or hurting each sector?', 'Sector × factor grid, diverging color'],
        ['Backtest', 'Has this worked, and is it working now?', 'Hit rates, top-3 vs SPY vs equal weight equity curve, calibration table by score range, live graded call log'],
      ]} />

      <H n="5">Limits and next steps</H>
      <P>
        The backtest covers roughly 2007 onward for the market factors and is in-sample for the design choices, even though weights
        were set by reasoning rather than optimization. Treat the live track record as the real test; it starts on the first scheduled
        run. Sensible next additions are a regime-aware weight set (different factor weights in high-volatility regimes), FRED
        high-yield spreads in place of HYG/IEF for a longer history, and an email or Slack digest when the bias label changes.
      </P>
      <H3>Fixes to the original dashboard code</H3>
      <ul className="text-sm text-slate-300 list-disc pl-5 flex flex-col gap-1 max-w-[70ch]">
        <li>Random-number “refresh” replaced with real pipeline data loaded from JSON.</li>
        <li>Moving a weight slider no longer resets refreshed data to the hard-coded starting values.</li>
        <li>The timestamp was labeled UTC while showing local time; it now shows the market close date.</li>
        <li>Volatility and the Sharpe-style ratio were hard-coded; both are now computed from 63 days of returns.</li>
        <li>Sector groups now follow Morningstar's Cyclical / Sensitive / Defensive definitions (Industrials and Energy are Sensitive, Real Estate is Cyclical).</li>
      </ul>
    </article>
  );
}
