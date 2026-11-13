# Microstructure research (kline-only)

**Status:** Research complete. **Production TOMLs and strategy code are unchanged** until you approve a filter.

**How to reproduce:**

```bash
python3 tools/microstructure_research.py
```

Output: `out/reports/microstructure-research.json` (same period as each config’s `[backtest]` block).

## What we measured

From **3m OHLCV** only (no tick, L2, delta, or GEX):

| Metric | Definition |
|--------|------------|
| **Session VWAP** | Typical price × volume from session open through entry bar |
| **POC** | Price bucket with highest distributed volume (OHLC spread across open/high/low/close) |
| **Value area (70%)** | Smallest set of top volume buckets covering 70% of session volume |
| **Session anchor** | **London** session for `london-mid-engulf`; **New York** session for `fade-reversal` (IST session times in `aar/core/sessions.py`) |

Filters are **counterfactual**: “what if we had only taken trades that also passed rule X at entry?”

## Period

Both winner configs: **2021-08-01 → 2026-08-01**.

---

## fade-reversal (`config.btc.fade-reversal-ny-trend.toml`)

| Filter | Trades | Win % | Net PnL (USD) | Avg / trade | Retention |
|--------|--------|-------|---------------|-------------|-----------|
| **Baseline** | 118 | 39.8 | **3,551.77** | 30.10 | 100% |
| VWAP aligned (long above / short below NY VWAP) | 66 | 42.4 | 2,519.63 | **38.18** | 55.9% |
| VWAP stretch ≥ 0.15% from VWAP | 74 | 40.5 | 2,215.17 | 29.93 | 62.7% |
| POC aligned | 73 | 42.5 | 2,545.63 | 34.87 | 61.9% |
| Inside value area | 114 | 39.5 | 3,256.01 | 28.56 | 96.6% |
| Outside value area | 4 | 50.0 | 295.76 | 73.94 | 3.4% |
| Combo fade (stretch + outside VA + VWAP aligned) | 4 | 50.0 | 295.76 | 73.94 | 3.4% |

**Takeaways**

- **Total net PnL is highest on the unfiltered baseline.** No kline filter beat baseline on dollars over this window.
- **VWAP/POC “with-trend” alignment** raises win rate and **average** trade size but drops too many winners; net PnL falls ~29–37%.
- Almost all fade entries sit **inside** the NY value area (114/118); “outside VA” is too few trades to trust.
- A **fade-specific** rule (e.g. enter *against* stretched NY VWAP, or require rejection from VA edge) was **not** in this pass — worth a follow-up research script only.

**Order flow / footprint:** not available from Vision klines; would need aggTrades or book data.

---

## london-mid-engulf (`config.btc.london-mid-engulf-winner.toml`)

| Filter | Trades | Win % | Net PnL (USD) | Avg / trade | Retention |
|--------|--------|-------|---------------|-------------|-----------|
| **Baseline** | 689 | 5.52 | **1,110.29** | 1.61 | 100% |
| VWAP aligned (London) | 569 | 5.45 | 637.03 | 1.12 | 82.6% |
| POC aligned | 469 | 5.76 | **1,490.14** | **3.18** | 68.1% |
| Inside value area | 688 | 5.52 | 1,171.88 | 1.70 | 99.9% |
| Outside value area | 1 | 0.0 | -61.59 | — | 0.1% |
| **Combo London** (VWAP + POC + inside VA) | 417 | 5.76 | **1,328.51** | **3.19** | 60.5% |

**Takeaways**

- Strategy is **low win rate, positive expectancy**; filters should be judged on **net PnL**, not win % alone.
- **POC alignment** (long above London POC / short below) improves net PnL by ~**+34%** vs baseline with ~68% of trades kept.
- **Combo London** (VWAP + POC + inside VA) is similar: **+20%** net PnL, ~60% retention — best candidate if you want a **confluence** gate.
- **London VWAP-only** alignment **hurts** total PnL; POC carries most of the benefit.
- Entries are almost always **inside** London value area; profile edges are rarely used today.

---

## Recommendation (for your approval only)

| Strategy | Suggested next step | Do **not** ship yet |
|----------|---------------------|---------------------|
| **london-mid-engulf** | Paper-test **POC-aligned** or **combo London** in research/forward test harness | Changing winner TOML until you say yes |
| **fade-reversal** | Keep baseline; optional research on **counter-VWAP** / VA-edge fades | “VWAP aligned” trend filter — hurts net PnL here |
| **Both** | GEX / options / true order flow | No data path in repo |

---

## Files

- `aar/research/session_metrics.py` — VWAP, POC, value area from candles  
- `tools/microstructure_research.py` — backtest + filter simulation  
- `out/reports/microstructure-research.json` — machine-readable results  
