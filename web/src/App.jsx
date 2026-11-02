import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, RefreshCw, BarChart3, ShieldAlert, Layers, ArrowUpDown, Info,
  Activity, Search, Filter, Sliders, Target, Grid3x3, LineChart as LineIcon, BookOpen, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart,
  Scatter, ZAxis, ReferenceLine, LineChart, Line, ReferenceArea, LabelList,
} from 'recharts';
import Methodology from './Methodology.jsx';

// ---------- formatting ----------
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const pct = (v, d = 2) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}%`);
const signed = (v, d = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}`);
const tone = (v) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');

const BIAS_STYLE = {
  Bullish: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  Neutral: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  Bearish: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};
const QUAD_STYLE = {
  Leading: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Weakening: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Lagging: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  Improving: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
};
const FACTOR_NAMES = {
  trend: 'Trend', momentum: 'Momentum', breadth: 'Breadth', risk_appetite: 'Risk appetite',
  volatility: 'Volatility', credit: 'Credit', financial_conditions: 'Financial conditions',
};
const TABS = [
  ['summary', 'Summary', Activity], ['sectors', 'Leaderboard', Layers], ['rotation', 'Rotation', Target],
  ['heatmap', 'Heatmap', Grid3x3], ['backtest', 'Backtest', LineIcon], ['method', 'Methodology', BookOpen],
];
const TIP = { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

const Card = ({ children, className = '' }) => (
  <section className={`bg-slate-900/80 border border-slate-800 rounded-2xl min-w-0 ${className}`}>{children}</section>
);
const CardHead = ({ icon: Icon, title, sub, right }) => (
  <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-xs font-semibold tracking-wider text-slate-200 flex items-center gap-2 uppercase">
        {Icon && <Icon className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />}{title}
      </h2>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
    {right}
  </div>
);
const Pill = ({ children, cls }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${cls}`}>{children}</span>
);

// ---------- data hook ----------
function useData() {
  const [state, setState] = useState({ latest: null, backtest: null, error: null, loading: true });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const bust = `?t=${Date.now()}`;
      const [a, b] = await Promise.all([
        fetch(`./data/latest.json${bust}`).then((r) => { if (!r.ok) throw new Error(`latest.json ${r.status}`); return r.json(); }),
        fetch(`./data/backtest.json${bust}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setState({ latest: a, backtest: b, error: null, loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e.message, loading: false }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function useHashTab() {
  const read = () => (TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'summary');
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [tab, (k) => { location.hash = k; setTab(k); }];
}

// =====================================================================================
export default function App() {
  const { latest, backtest, error, loading, reload } = useData();
  const [tab, setTab] = useHashTab();

  const stale = useMemo(() => {
    if (!latest) return false;
    const days = (Date.now() - new Date(`${latest.asOf}T21:00:00Z`).getTime()) / 864e5;
    return days > 4;
  }, [latest]);

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 font-sans antialiased">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-cyan-300 text-slate-950 px-3 py-2 rounded-lg font-semibold">Skip to content</a>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 py-5">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/40 rounded-xl text-cyan-400 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Sector Rotation Engine</h1>
              <p className="text-xs text-slate-400">30–90 day market bias and sector relative strength</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latest && (
              <div className="text-right text-xs">
                <div className="text-slate-400">Data as of close</div>
                <div className={`font-mono num ${stale ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {latest.asOf}{stale ? ' (stale)' : ''}
                </div>
              </div>
            )}
            <button type="button" onClick={reload} disabled={loading} aria-busy={loading}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium px-3.5 py-2 rounded-xl border border-slate-700 hover:border-cyan-500/50 transition disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-sm">{loading ? 'Loading' : 'Reload data'}</span>
            </button>
          </div>
        </header>

        {latest?.sample && (
          <div role="note" className="mb-5 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span><b>Sample data.</b> These numbers come from synthetic prices so you can see the layout. Every figure is replaced with real Yahoo Finance and FRED data after the first scheduled pipeline run.</span>
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto mb-5 bg-slate-900/60 border border-slate-800 rounded-xl p-1" aria-label="Views">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                tab === k ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />{label}
            </button>
          ))}
        </nav>

        {error && !latest && (
          <Card className="p-6 text-sm text-rose-300">
            Could not load <span className="font-mono">data/latest.json</span> ({error}). Run <span className="font-mono">python pipeline/run_daily.py</span> to create it.
          </Card>
        )}

        <main id="main" tabIndex={-1} aria-live="polite">
        {tab === 'method' ? <Methodology latest={latest} /> : latest && (
          <>
            {tab === 'summary' && <Summary d={latest} />}
            {tab === 'sectors' && <Leaderboard d={latest} />}
            {tab === 'rotation' && <Rotation d={latest} />}
            {tab === 'heatmap' && <Heatmap d={latest} />}
            {tab === 'backtest' && <Backtest bt={backtest} track={latest.track} />}
          </>
        )}
        </main>

        <footer className="border-t border-slate-800 pt-4 mt-8 text-[11px] leading-relaxed text-slate-400 flex flex-col gap-1">
          <span>Model output for research and discussion. It is not a recommendation to buy or sell any security, and past or backtested results do not guarantee future returns.</span>
          {latest && <span className="font-mono">Generated {new Date(latest.generatedAt).toLocaleString()} · weights 30D {latest.config.w30} / 90D {latest.config.w90}</span>}
        </footer>
      </div>
    </div>
  );
}

// =====================================================================================
// SUMMARY
// =====================================================================================
function BiasGauge({ score, bull, bear }) {
  const pos = (v) => `${((v + 100) / 200) * 100}%`;
  return (
    <div className="mt-3">
      <div role="meter" aria-label="Market bias score" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`${score} on a scale of minus 100 to plus 100`} className="relative h-3 rounded-full overflow-hidden bg-slate-800">
        <div className="absolute inset-y-0 bg-rose-500/40" style={{ left: 0, width: pos(bear) }} />
        <div className="absolute inset-y-0 bg-amber-500/30" style={{ left: pos(bear), width: `${((bull - bear) / 200) * 100}%` }} />
        <div className="absolute inset-y-0 bg-emerald-500/40" style={{ left: pos(bull), right: 0 }} />
        <div className="absolute -top-0.5 w-1.5 h-4 bg-white rounded-sm shadow" style={{ left: `calc(${pos(score)} - 3px)` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1 num">
        <span>-100</span><span>{bear}</span><span>0</span><span>+{bull}</span><span>+100</span>
      </div>
    </div>
  );
}

function IdeaCard({ idea, hedge }) {
  const long = idea.side === 'Long';
  return (
    <div className={`rounded-xl border p-3 bg-slate-950/50 ${hedge ? 'border-sky-500/30' : 'border-slate-800'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono font-bold text-lg">{idea.ticker}</span>
          <span className="text-xs text-slate-400 truncate">{idea.name}</span>
        </div>
        <Pill cls={hedge ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' : long ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'}>
          {hedge ? `Hedge · ${idea.side}` : idea.side}
        </Pill>
      </div>
      <p className="text-xs text-slate-400 mt-1.5 leading-snug">{idea.why}</p>
      <dl className="grid grid-cols-4 gap-2 mt-3 text-xs font-mono num">
        <div><dt className="text-[10px] text-slate-400">ENTRY</dt><dd>{fmt(idea.entry[0])}–{fmt(idea.entry[1])}</dd></div>
        <div><dt className="text-[10px] text-slate-400">STOP</dt><dd className="text-rose-300">{fmt(idea.stop)}</dd></div>
        <div><dt className="text-[10px] text-slate-400">TARGET</dt><dd className="text-emerald-300">{fmt(idea.target)}</dd></div>
        <div><dt className="text-[10px] text-slate-400">R:R</dt><dd>{fmt(idea.rewardRisk, 1)}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[10px] text-slate-400 font-mono num">
        <span>50D {fmt(idea.levels.sma50)}</span><span>200D {fmt(idea.levels.sma200)}</span>
        <span>Pivot {fmt(idea.levels.pivot)}</span><span>ATR {fmt(idea.levels.atr14)}</span>
      </div>
    </div>
  );
}

function Summary({ d }) {
  const b = d.bias;
  const top = d.sectors[0];
  const low = d.sectors[d.sectors.length - 1];
  const lv = d.benchmark.levels;
  const factors = [...b.factors].sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <Card className="lg:col-span-5 p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="uppercase tracking-wider font-semibold">30–90 day market bias</span>
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-end gap-3 mt-3 flex-wrap">
          <Pill cls={`${BIAS_STYLE[b.label]} text-sm px-3 py-1`}>{b.label}</Pill>
          <span className="font-mono text-4xl font-bold num">{signed(b.score)}</span>
          <span className="text-xs text-slate-400 pb-1.5">of ±100</span>
        </div>
        <BiasGauge score={b.score} bull={d.config.bull} bear={d.config.bear} />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Model confidence</div>
            <div className="font-mono text-2xl font-semibold num">{b.confidence}<span className="text-sm text-slate-400">/100</span></div>
            <div className="text-[11px] text-slate-400">{Math.round(b.agreement * 100)}% of factor weight agrees</div>
          </div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Historical hit rate</div>
            {b.calibrated ? (
              <>
                <div className="font-mono text-2xl font-semibold num">{fmt(b.calibrated.historicalHitRate63, 0)}%</div>
                <div className="text-[11px] text-slate-400">63d calls in score range {b.calibrated.bucket} (n={b.calibrated.n})</div>
              </>
            ) : <div className="text-sm text-slate-400 mt-1">Needs backtest</div>}
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-7">
        <CardHead icon={BarChart3} title="What is driving the score" sub="Each factor's contribution in points; bars to the right support equities" />
        <div className="p-4 flex flex-col gap-2.5">
          {factors.map((f) => (
            <div key={f.key} className="grid grid-cols-[110px_1fr_48px] sm:grid-cols-[140px_1fr_52px] items-center gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200">{FACTOR_NAMES[f.key] || f.key}</div>
                <div className="text-[10px] text-slate-400 num">weight {Math.round(f.weight * 100)}%</div>
              </div>
              <div className="min-w-0">
                <div className="relative h-2.5 bg-slate-800 rounded-full">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600" />
                  <div className={`absolute top-0 bottom-0 rounded-full ${f.reading >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={f.reading >= 0 ? { left: '50%', width: `${f.reading * 50}%` } : { right: '50%', width: `${-f.reading * 50}%` }} />
                </div>
                <div className="text-[10px] text-slate-400 mt-1 truncate" title={f.detail}>{f.detail}</div>
              </div>
              <div className={`text-right font-mono text-xs font-semibold num ${tone(f.contribution)}`}>{signed(f.contribution)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="lg:col-span-8">
        <CardHead icon={LineIcon} title="Bias score, last six months" sub="Shaded bands mark the bullish and bearish thresholds" />
        <div className="h-[260px] p-2 pr-4" role="img" aria-label={`Line chart of the daily bias score over the last six months, ending at ${signed(b.score)}, plotted with SPY price`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.biasHistory} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <ReferenceArea yAxisId="s" y1={d.config.bull} y2={100} fill="#10b981" fillOpacity={0.06} />
              <ReferenceArea yAxisId="s" y1={-100} y2={d.config.bear} fill="#f43f5e" fillOpacity={0.06} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={40} tickFormatter={(v) => v.slice(5)} />
              <YAxis yAxisId="s" domain={[-100, 100]} stroke="#64748b" fontSize={10} ticks={[-100, -50, 0, 50, 100]} />
              <YAxis yAxisId="p" orientation="right" stroke="#475569" fontSize={10} domain={['auto', 'auto']} width={44} />
              <Tooltip contentStyle={TIP} />
              <ReferenceLine yAxisId="s" y={0} stroke="#475569" />
              <Line yAxisId="p" dataKey="spy" name="SPY" stroke="#64748b" dot={false} strokeWidth={1.2} />
              <Line yAxisId="s" dataKey="score" name="Bias score" stroke="#22d3ee" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="lg:col-span-4">
        <CardHead icon={Target} title="SPY key levels" />
        <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono num">
          {[['Last', lv.last], ['ATR (14)', lv.atr14], ['20-day', lv.sma20], ['50-day', lv.sma50], ['200-day', lv.sma200],
            ['Pivot', lv.pivot], ['R1', lv.r1], ['S1', lv.s1], ['63d high', lv.high63], ['63d low', lv.low63]].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-800/70 pb-1">
              <span className="text-slate-400 font-sans">{k}</span><span className="text-slate-200">{fmt(v)}</span>
            </div>
          ))}
          <div className="col-span-2 flex justify-between pt-1">
            <span className="text-slate-400 font-sans">Return 30D / 90D</span>
            <span><span className={tone(d.benchmark.ret30)}>{pct(d.benchmark.ret30)}</span> / <span className={tone(d.benchmark.ret90)}>{pct(d.benchmark.ret90)}</span></span>
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-12">
        <CardHead icon={TrendingUp} title="Trade setups" sub="Top three sectors in an uptrend, plus a hedge chosen by the current regime. Stops are 2× ATR; targets are the larger of R1 or 3× ATR." />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {d.ideas.longs.map((i) => <IdeaCard key={i.ticker} idea={i} />)}
          <IdeaCard idea={d.ideas.hedge} hedge />
        </div>
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400"><TrendingUp className="w-4 h-4 text-emerald-400" />Leader: <b className="text-slate-200 font-mono">{top.ticker}</b> {top.name}, {pct(top.vsSpy90, 1)} vs SPY (90D)</div>
          <div className="flex items-center gap-2 text-slate-400"><TrendingDown className="w-4 h-4 text-rose-400" />Laggard: <b className="text-slate-200 font-mono">{low.ticker}</b> {low.name}, {pct(low.vsSpy90, 1)} vs SPY (90D)</div>
        </div>
      </Card>
    </div>
  );
}

// =====================================================================================
// LEADERBOARD (the original dashboard, wired to real data)
// =====================================================================================
function Leaderboard({ d }) {
  const [group, setGroup] = useState('All');
  const [q, setQ] = useState('');
  const [sortField, setSortField] = useState('score');
  const [dir, setDir] = useState('desc');
  const [w30, setW30] = useState(d.config.w30);
  const w90 = Number((1 - w30).toFixed(2));

  const rows = useMemo(() => {
    let r = d.sectors.map((s) => ({ ...s, custom: Number((s.vsSpy30 * w30 + s.vsSpy90 * w90).toFixed(2)) }));
    if (group !== 'All') r = r.filter((s) => s.group === group);
    if (q) r = r.filter((s) => `${s.ticker} ${s.name}`.toLowerCase().includes(q.toLowerCase()));
    r.sort((a, b) => {
      const x = a[sortField], y = b[sortField];
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return dir === 'asc' ? c : -c;
    });
    return r;
  }, [d, group, q, sortField, dir, w30, w90]);

  const sort = (f) => { if (f === sortField) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setDir('desc'); } };
  const Th = ({ f, children, right }) => (
    <th scope="col" aria-sort={sortField === f ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`p-3 whitespace-nowrap ${right ? 'text-right' : ''}`}>
      <button type="button" onClick={() => sort(f)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-cyan-300 ${sortField === f ? 'text-cyan-300' : ''}`}>
        {children}<ArrowUpDown className="w-3 h-3" aria-hidden="true" /><span className="sr-only">, sort</span>
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1"><Filter className="w-3.5 h-3.5" />Group</span>
          {['All', 'Cyclical', 'Sensitive', 'Defensive'].map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${group === g ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'}`}>{g}</button>
          ))}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-slate-300" htmlFor="w30">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />30D weight
            <input id="w30" type="range" min="0" max="1" step="0.05" value={w30} onChange={(e) => setW30(parseFloat(e.target.value))} className="accent-cyan-500 w-28" />
            <span className="font-mono num text-cyan-300 w-20">{Math.round(w30 * 100)}/{Math.round(w90 * 100)}</span>
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input id="search" aria-label="Filter by ticker or sector" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker or sector"
              className="w-48 bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500/60 outline-none" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-8 overflow-hidden">
          <CardHead icon={Layers} title="Sector relative strength leaderboard"
            sub="Engine score blends relative strength, risk-adjusted RS, trend and regime fit. Weighted RS is the original script's formula at the slider weights." />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
                <tr>
                  <th scope="col" className="p-3 text-center">Rank</th>
                  <Th f="ticker">Ticker</Th><Th f="name">Sector</Th>
                  <Th f="ret30" right>30D</Th><Th f="ret90" right>90D</Th>
                  <Th f="vsSpy90" right>vs SPY 90D</Th><Th f="custom" right>Weighted RS</Th>
                  <Th f="score" right>Engine</Th>
                  <th className="p-3 text-center">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono num">
                {rows.map((s) => (
                  <tr key={s.ticker} className="hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-semibold">#{s.rank}</td>
                    <td className="p-3"><span className="bg-slate-800 px-2 py-1 rounded text-cyan-300 border border-slate-700 font-bold">{s.ticker}</span></td>
                    <td className="p-3 font-sans"><div className="text-slate-200">{s.name}</div><div className="text-[10px] text-slate-400">{s.group} · trend {s.trend > 0 ? 'up' : s.trend < 0 ? 'down' : 'mixed'}</div></td>
                    <td className={`p-3 text-right ${tone(s.ret30)}`}>{pct(s.ret30)}</td>
                    <td className={`p-3 text-right ${tone(s.ret90)}`}>{pct(s.ret90)}</td>
                    <td className={`p-3 text-right font-semibold ${s.vsSpy90 >= 0 ? 'text-teal-300' : 'text-orange-400'}`}>{pct(s.vsSpy90)}</td>
                    <td className={`p-3 text-right ${tone(s.custom)}`}>{signed(s.custom, 2)}</td>
                    <td className="p-3 text-right"><span className={`px-2 py-0.5 rounded border font-semibold ${s.score > 0 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'}`}>{signed(s.score, 2)}</span></td>
                    <td className="p-3 text-center font-sans"><Pill cls={QUAD_STYLE[s.quadrant]}>{s.quadrant}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-4 flex flex-col">
          <CardHead icon={BarChart3} title="Relative strength vs SPY (90D)" right={<span className="text-[10px] text-slate-400 font-mono">excess %</span>} />
          <div className="h-[400px] p-2" role="img" aria-label={`Bar chart of 90-day return versus SPY: ${rows.map((r) => `${r.ticker} ${pct(r.vsSpy90, 1)}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${v}%`} />
                <YAxis dataKey="ticker" type="category" stroke="#94a3b8" fontSize={11} width={44} />
                <ReferenceLine x={0} stroke="#475569" />
                <Tooltip contentStyle={TIP} formatter={(v) => [`${v}%`, 'vs SPY 90D']} cursor={{ fill: '#1e293b55' }} />
                <Bar dataKey="vsSpy90" radius={[0, 4, 4, 0]}>
                  {rows.map((r) => <Cell key={r.ticker} fill={r.vsSpy90 >= 0 ? '#10b981' : '#f43f5e'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="m-4 mt-0 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 flex gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>Weighted RS = {w30.toFixed(2)} × RS₃₀ + {w90.toFixed(2)} × RS₉₀, where RS is the sector return minus SPY over 21 and 63 trading days.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================================
// ROTATION MATRIX
// =====================================================================================
function Rotation({ d }) {
  const data = d.sectors;
  const ext = Math.ceil(Math.max(...data.flatMap((s) => [Math.abs(s.vsSpy30), Math.abs(s.vsSpy90)])) + 1);
  const color = { Leading: '#10b981', Weakening: '#f59e0b', Lagging: '#f43f5e', Improving: '#38bdf8' };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <Card className="lg:col-span-8">
        <CardHead icon={Target} title="30D vs 90D rotation matrix" sub="Sectors move clockwise: Improving → Leading → Weakening → Lagging. Bubble size is volatility." />
        <div className="h-[460px] p-2" role="img" aria-label={`Scatter plot of sectors by 30-day and 90-day relative strength: ${data.map((s) => `${s.ticker} ${s.quadrant}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 20, bottom: 28, left: 4 }}>
              <ReferenceArea x1={0} x2={ext} y1={0} y2={ext} fill="#10b981" fillOpacity={0.05} label={{ value: 'LEADING', position: 'insideTopRight', fill: '#10b981', fontSize: 11 }} />
              <ReferenceArea x1={-ext} x2={0} y1={0} y2={ext} fill="#f59e0b" fillOpacity={0.05} label={{ value: 'WEAKENING', position: 'insideTopLeft', fill: '#f59e0b', fontSize: 11 }} />
              <ReferenceArea x1={-ext} x2={0} y1={-ext} y2={0} fill="#f43f5e" fillOpacity={0.05} label={{ value: 'LAGGING', position: 'insideBottomLeft', fill: '#f43f5e', fontSize: 11 }} />
              <ReferenceArea x1={0} x2={ext} y1={-ext} y2={0} fill="#38bdf8" fillOpacity={0.05} label={{ value: 'IMPROVING', position: 'insideBottomRight', fill: '#38bdf8', fontSize: 11 }} />
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" dataKey="vsSpy30" domain={[-ext, ext]} stroke="#64748b" fontSize={10} unit="%"
                label={{ value: 'Short-term momentum (30D vs SPY)', position: 'bottom', offset: 8, fill: '#64748b', fontSize: 11 }} />
              <YAxis type="number" dataKey="vsSpy90" domain={[-ext, ext]} stroke="#64748b" fontSize={10} unit="%" />
              <ZAxis dataKey="volatility" range={[80, 380]} />
              <ReferenceLine x={0} stroke="#475569" /><ReferenceLine y={0} stroke="#475569" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => payload?.length ? (
                <div style={TIP} className="p-2.5 font-mono">
                  <div className="text-cyan-300 font-bold">{payload[0].payload.ticker} · {payload[0].payload.name}</div>
                  <div>30D vs SPY {pct(payload[0].payload.vsSpy30)}</div><div>90D vs SPY {pct(payload[0].payload.vsSpy90)}</div>
                  <div className="text-slate-400">Vol {fmt(payload[0].payload.volatility, 1)}%</div>
                </div>) : null} />
              <Scatter data={data}>
                {data.map((s) => <Cell key={s.ticker} fill={color[s.quadrant]} fillOpacity={0.85} />)}
                <LabelList dataKey="ticker" position="top" fill="#cbd5e1" fontSize={10} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="lg:col-span-4">
        <CardHead icon={Info} title="Reading the phases" />
        <div className="p-4 flex flex-col gap-3 text-xs text-slate-300">
          {['Leading', 'Weakening', 'Lagging', 'Improving'].map((qd) => {
            const list = data.filter((s) => s.quadrant === qd);
            const text = {
              Leading: 'Outperforming on both horizons. Core long candidates.',
              Weakening: 'Strong over 90 days but losing ground this month. Tighten stops, avoid new entries.',
              Lagging: 'Underperforming on both horizons. Underweight or funding source.',
              Improving: 'Weak over 90 days but turning up. Early rotation watch list.',
            }[qd];
            return (
              <div key={qd} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between"><Pill cls={QUAD_STYLE[qd]}>{qd}</Pill><span className="font-mono text-slate-400">{list.map((s) => s.ticker).join(' ') || '—'}</span></div>
                <p className="text-slate-400 mt-1.5">{text}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// =====================================================================================
// HEATMAP
// =====================================================================================
function cellColor(v, scale) {
  if (v === null || v === undefined) return 'transparent';
  const t = Math.max(-1, Math.min(1, v / scale));
  return t >= 0 ? `rgba(16,185,129,${0.08 + 0.55 * t})` : `rgba(244,63,94,${0.08 + 0.55 * -t})`;
}
function Heatmap({ d }) {
  const cols = [
    ['ret30', '30D return', 6, (v) => pct(v, 1)], ['ret90', '90D return', 12, (v) => pct(v, 1)],
    ['vsSpy30', '30D vs SPY', 4, (v) => pct(v, 1)], ['vsSpy90', '90D vs SPY', 8, (v) => pct(v, 1)],
    ['riskAdjusted', 'Risk-adj. RS', 1.5, (v) => fmt(v)], ['trend', 'Trend', 1, (v) => (v > 0 ? 'Up' : v < 0 ? 'Down' : 'Mixed')],
    ['regimeFit', 'Regime fit', 0.8, (v) => signed(v, 2)], ['score', 'Engine score', 1.5, (v) => signed(v, 2)],
  ];
  return (
    <Card>
      <CardHead icon={Grid3x3} title="Sector heatmap" sub="Green supports the sector, red works against it. Sorted by engine score." />
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[760px] text-xs font-mono num border-separate" style={{ borderSpacing: 3 }}>
          <thead><tr className="text-slate-400 text-[10px] uppercase tracking-wider">
            <th className="text-left p-2 font-sans">Sector</th>{cols.map(([k, l]) => <th key={k} className="p-2 text-center">{l}</th>)}
          </tr></thead>
          <tbody>
            {d.sectors.map((s) => (
              <tr key={s.ticker}>
                <td className="p-2 font-sans whitespace-nowrap"><b className="font-mono text-cyan-300">{s.ticker}</b> <span className="text-slate-400">{s.name}</span></td>
                {cols.map(([k, , scale, f]) => (
                  <td key={k} className="p-2 text-center rounded-md text-slate-100" style={{ background: cellColor(s[k], scale) }}>{f(s[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// =====================================================================================
// BACKTEST + LIVE TRACK RECORD
// =====================================================================================
function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 min-w-0">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="font-mono text-xl font-semibold num mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
function Backtest({ bt, track }) {
  if (!bt || bt.error) return <Card className="p-6 text-sm text-slate-400">Backtest not available yet. {bt?.error}</Card>;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Bias hit rate, 21d" value={`${fmt(bt.bias.hitRate21, 1)}%`} sub={`${bt.bias.directionalCalls} bullish/bearish calls`} />
        <Stat label="Bias hit rate, 63d" value={`${fmt(bt.bias.hitRate63, 1)}%`} sub="Neutral calls excluded" />
        <Stat label="Top 3 vs SPY, 21d" value={pct(bt.sectors.top3AvgExcess21)} sub={`beats SPY ${fmt(bt.sectors.top3WinRate21, 0)}% of months`} />
        <Stat label="Top 3 minus bottom 3" value={pct(bt.sectors.topMinusBottom21)} sub="average monthly spread" />
        <Stat label="CAGR top 3 / SPY" value={`${fmt(bt.sectors.cagrTop3, 1)} / ${fmt(bt.sectors.cagrSpy, 1)}%`} sub={`equal-weight ${fmt(bt.sectors.cagrEqualWeight, 1)}%`} />
        <Stat label="Live hit rate, 21d" value={track?.hitRate21 != null ? `${fmt(track.hitRate21, 1)}%` : '—'} sub={`${track?.gradedCalls21 ?? 0} graded of ${track?.daysLogged ?? 0} logged`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-7">
          <CardHead icon={LineIcon} title="Growth of $1, monthly rebalance" sub={`${bt.start} to ${bt.end}, ${bt.months} months`} />
          <div className="h-[300px] p-2 pr-4" role="img" aria-label={`Line chart of growth of one dollar: top 3 sectors ${fmt(bt.equity.at(-1)?.top3)}, SPY ${fmt(bt.equity.at(-1)?.spy)}, equal weight ${fmt(bt.equity.at(-1)?.equalWeight)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bt.equity} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={50} tickFormatter={(v) => v.slice(0, 7)} />
                <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} tickFormatter={(v) => v.toFixed(1)} />
                <Tooltip contentStyle={TIP} formatter={(v) => `$${Number(v).toFixed(2)}`} />
                <ReferenceLine y={1} stroke="#475569" />
                <Line dataKey="spy" name="SPY" stroke="#94a3b8" dot={false} strokeWidth={1.5} />
                <Line dataKey="equalWeight" name="All sectors equal weight" stroke="#a78bfa" dot={false} strokeWidth={1.2} strokeDasharray="4 3" />
                <Line dataKey="top3" name="Top 3 sectors" stroke="#22d3ee" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="xl:col-span-5">
          <CardHead icon={ShieldAlert} title="Calibration by score range" sub="How SPY actually behaved after each score range" />
          <div className="overflow-x-auto p-2">
            <table className="w-full text-xs font-mono num">
              <thead className="text-slate-400 text-[10px] uppercase"><tr>
                <th className="p-2 text-left font-sans">Score</th><th className="p-2 text-right">n</th>
                <th className="p-2 text-right">Up 21d</th><th className="p-2 text-right">Up 63d</th><th className="p-2 text-right">Avg 63d</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/60">
                {bt.bias.buckets.map((b) => (
                  <tr key={b.bucket}>
                    <td className="p-2 font-sans text-slate-300">{b.bucket}</td><td className="p-2 text-right text-slate-400">{b.n}</td>
                    <td className="p-2 text-right">{fmt(b.pctUp21, 0)}%</td><td className="p-2 text-right">{fmt(b.pctUp63, 0)}%</td>
                    <td className={`p-2 text-right ${tone(b.avg63)}`}>{pct(b.avg63)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="text-[11px] text-slate-400 p-2 flex flex-col gap-1 list-disc pl-5">
              {bt.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <CardHead icon={Activity} title="Live track record" sub="Every daily call is logged and graded once 21 and 63 trading days have passed. This is the out-of-sample record." />
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono num min-w-[600px]">
            <thead className="bg-slate-950/70 text-slate-400 text-[10px] uppercase"><tr>
              <th className="p-3 text-left">Date</th><th className="p-3 text-left font-sans">Call</th><th className="p-3 text-right">Score</th>
              <th className="p-3 text-left">Top 3</th><th className="p-3 text-right">SPY next 21d</th><th className="p-3 text-right">SPY next 63d</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800/60">
              {(track?.recent || []).map((r) => (
                <tr key={r.date}>
                  <td className="p-3 text-slate-400">{r.date}</td><td className="p-3 font-sans"><Pill cls={BIAS_STYLE[r.label]}>{r.label}</Pill></td>
                  <td className="p-3 text-right">{signed(r.score)}</td><td className="p-3 text-slate-300">{r.top3}</td>
                  <td className={`p-3 text-right ${r.spy21 == null ? 'text-slate-400' : tone(r.spy21)}`}>{r.spy21 == null ? 'pending' : pct(r.spy21)}</td>
                  <td className={`p-3 text-right ${r.spy63 == null ? 'text-slate-400' : tone(r.spy63)}`}>{r.spy63 == null ? 'pending' : pct(r.spy63)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
