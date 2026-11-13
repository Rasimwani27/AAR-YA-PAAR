# Registered backtest strategies (two)

| # | Strategy ID | Config (production) | Session / idea |
|---|-------------|---------------------|----------------|
| 1 | **`fade-reversal`** | `config.btc.fade-reversal-ny-trend.toml` | London 15m level break → **New York** 3m reversal patterns + 4h trend filter |
| 2 | **`london-mid-engulf`** | **`config.btc.london-mid-engulf-winner.toml`** (saved winner) | Observation vs London range bias → **London** mid + patterns, **BE @ +$200**, **$400 SL**, **1:10 TP**, skip **Mon** + **17–18 IST** |

Both use BTCUSDT 3m futures, weekday filters (no Sat/Sun), max **1 trade/day** unless you change `[risk]`.

## Run backtests

```bash
PYTHONPATH=/workspace python3 -m aar backtest --config config.btc.fade-reversal-ny-trend.toml
PYTHONPATH=/workspace python3 -m aar backtest --config config.btc.london-mid-engulf-winner.toml
```

`config.btc.london-mid-engulf.toml` is kept in sync with the winner file for day-to-day edits.
