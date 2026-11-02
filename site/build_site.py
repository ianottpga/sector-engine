"""Render the project website (site/index.html) from the pipeline's JSON output.

    python site/build_site.py   # after pipeline/run_daily.py
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = json.loads((ROOT / "web/public/data/latest.json").read_text())
B = json.loads((ROOT / "web/public/data/backtest.json").read_text())
e = html.escape


def pct(v, d=1):
    return "—" if v is None else f"{v:+.{d}f}%"


def cls(v):
    return "pos" if (v or 0) > 0 else "neg" if (v or 0) < 0 else ""


FACTOR = {"trend": "Trend", "momentum": "Momentum", "breadth": "Breadth", "risk_appetite": "Risk appetite",
          "volatility": "Volatility", "credit": "Credit", "financial_conditions": "Financial conditions"}
b = D["bias"]
sample = D.get("sample")

sector_rows = "\n".join(
    f"<tr><td class='num'>{s['rank']}</td><th scope='row'><span class='tk'>{s['ticker']}</span> {e(s['name'])}</th>"
    f"<td>{s['group']}</td><td class='num {cls(s['ret90'])}'>{pct(s['ret90'])}</td>"
    f"<td class='num {cls(s['vsSpy90'])}'>{pct(s['vsSpy90'])}</td><td class='num {cls(s['score'])}'>{s['score']:+.2f}</td>"
    f"<td><span class='phase {s['quadrant'].lower()}'>{s['quadrant']}</span></td></tr>"
    for s in D["sectors"])

factor_rows = "\n".join(
    f"<li><span class='fname'>{FACTOR.get(f['key'], f['key'])}</span>"
    f"<span class='bar' aria-hidden='true'><i class='{'pos' if f['reading'] >= 0 else 'neg'}' style='--w:{abs(f['reading']) * 50:.0f}%'></i></span>"
    f"<span class='num {cls(f['contribution'])}'>{f['contribution']:+.1f}</span>"
    f"<span class='fdetail'>{e(f['detail'])}</span></li>"
    for f in sorted(b["factors"], key=lambda f: -abs(f["contribution"])))


def idea(i, hedge=False):
    return (f"<article class='idea{' hedge' if hedge else ''}'><header><h4><span class='tk'>{i['ticker']}</span> {e(i['name'])}</h4>"
            f"<span class='side'>{'Hedge · ' if hedge else ''}{i['side']}</span></header><p>{e(i['why'])}</p>"
            f"<dl><div><dt>Entry</dt><dd class='num'>{i['entry'][0]:.2f}–{i['entry'][1]:.2f}</dd></div>"
            f"<div><dt>Stop</dt><dd class='num'>{i['stop']:.2f}</dd></div>"
            f"<div><dt>Target</dt><dd class='num'>{i['target']:.2f}</dd></div>"
            f"<div><dt>Reward : risk</dt><dd class='num'>{i['rewardRisk']}</dd></div></dl></article>")


ideas = "\n".join(idea(i) for i in D["ideas"]["longs"]) + idea(D["ideas"]["hedge"], True)

quads = ""
for q, note in [("Improving", "Weak over 90 days, turning up"), ("Leading", "Strong on both horizons"),
                ("Lagging", "Weak on both horizons"), ("Weakening", "Strong over 90 days, fading")]:
    members = " ".join(f"<span class='tk'>{s['ticker']}</span>" for s in D["sectors"] if s["quadrant"] == q) or "<span class='muted'>none</span>"
    quads += f"<div class='q {q.lower()}'><h4>{q}</h4><p>{note}</p><div class='members'>{members}</div></div>"

bucket_rows = "\n".join(
    f"<tr><th scope='row'>{x['bucket']}</th><td class='num'>{x['n']}</td><td class='num'>{x['pctUp21']:.0f}%</td>"
    f"<td class='num'>{'—' if x['pctUp63'] is None else str(round(x['pctUp63'])) + '%'}</td>"
    f"<td class='num {cls(x['avg63'])}'>{pct(x['avg63'], 2)}</td></tr>" for x in B["bias"]["buckets"])

cal = b.get("calibrated") or {}
spy = D["benchmark"]

sample_note = ("<p class='notice' role='note'><strong>These are sample results.</strong> They were produced by running the engine "
               "on synthetic prices so the layout can be reviewed. After the first scheduled run on GitHub, this page is "
               "rebuilt from real Yahoo Finance and FRED data.</p>") if sample else ""

page = Path(__file__).with_name("template.html").read_text()
for k, v in {
    "{{SAMPLE_NOTE}}": sample_note, "{{AS_OF}}": D["asOf"], "{{LABEL}}": b["label"], "{{LABEL_CLS}}": b["label"].lower(),
    "{{SCORE}}": f"{b['score']:+.1f}", "{{SCORE_POS}}": f"{(b['score'] + 100) / 2:.1f}", "{{CONF}}": str(b["confidence"]),
    "{{AGREE}}": f"{b['agreement'] * 100:.0f}", "{{HIT}}": f"{cal.get('historicalHitRate63', 0):.0f}",
    "{{HIT_N}}": str(cal.get("n", "—")), "{{HIT_BUCKET}}": cal.get("bucket", "—"),
    "{{SPY30}}": pct(spy["ret30"]), "{{SPY90}}": pct(spy["ret90"]),
    "{{FACTORS}}": factor_rows, "{{SECTOR_ROWS}}": sector_rows, "{{IDEAS}}": ideas, "{{QUADS}}": quads,
    "{{BUCKETS}}": bucket_rows, "{{BT_START}}": B["start"], "{{BT_END}}": B["end"], "{{BT_MONTHS}}": str(B["months"]),
    "{{HR21}}": f"{B['bias']['hitRate21']:.1f}", "{{HR63}}": f"{B['bias']['hitRate63']:.1f}",
    "{{EX21}}": pct(B["sectors"]["top3AvgExcess21"], 2), "{{WIN21}}": f"{B['sectors']['top3WinRate21']:.0f}",
    "{{SPREAD}}": pct(B["sectors"]["topMinusBottom21"], 2),
    "{{CAGR_TOP}}": f"{B['sectors']['cagrTop3']:.1f}", "{{CAGR_SPY}}": f"{B['sectors']['cagrSpy']:.1f}",
}.items():
    page = page.replace(k, v)
# Fragment for a claude.ai artifact, and a full document for GitHub Pages
(Path(__file__).with_name("index.html")).write_text(page)
(Path(__file__).with_name("standalone.html")).write_text(
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n</head>\n<body>\n'
    + page + '\n</body>\n</html>\n')
print("wrote site/index.html and site/standalone.html")
