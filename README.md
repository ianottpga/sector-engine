# Sector Rotation Engine

A daily-refreshing web dashboard that scores the market's 30–90 day direction (Bullish / Neutral / Bearish, with confidence) and ranks the 11 SPDR sector ETFs. It extends the original 30/90-day relative-strength script with a 7-factor market bias model, trend and regime filters, trade setups with ATR/pivot levels, a walk-forward backtest, and a live track record.

Runs free on GitHub: Actions fetches prices after each close, recomputes, commits the JSON, and redeploys the site to GitHub Pages.

## Layout

```
pipeline/
  engine.py        signal library (bias factors, sector scores, levels, trade ideas)
  backtest.py      walk-forward monthly backtest + calibration table
  run_daily.py     fetch -> compute -> write JSON  (--sample for offline synthetic data)
  requirements.txt
web/               Vite + React + Tailwind + Recharts dashboard (your original UI, wired to real data)
  public/data/     latest.json, backtest.json  (written by the pipeline)
history/
  signals.csv      append-only log of every daily call (created on first live run)
.github/workflows/daily.yml   scheduled refresh + deploy
```

## Set up (about 10 minutes)

1. Create a new GitHub repository and push this folder to it.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Daily refresh → Run workflow** to do the first run now. After that it runs every weekday at 21:45 UTC.
4. Your dashboard is at `https://<your-user>.github.io/<repo>/`.

The data shipped in `web/public/data/` is synthetic sample data (the page shows an amber "Sample data" banner). The first workflow run replaces it with real data.

## Run locally

```bash
cd pipeline && pip install -r requirements.txt && python run_daily.py   # real data
cd ../web && npm install && npm run dev                                  # http://localhost:5173
```

## Changing the model

- 30/90 weights: `python run_daily.py --w30 0.5 --w90 0.5` or edit `Config` in `engine.py`. The Leaderboard page also has a live slider for the weighted RS column.
- Factor weights and Bullish/Bearish thresholds: `Config.weights()`, `bull_threshold`, `bear_threshold`.
- Data vendor: replace `fetch_prices()` in `run_daily.py` (Polygon, Alpaca, Tiingo). It must return `close, high, low` DataFrames indexed by date with ticker columns.

## Caveats

Backtests exclude costs and taxes and are in-sample for the design. Yahoo Finance data via `yfinance` is unofficial; use a licensed feed before showing this to clients. Output is model research, not investment advice.
