# Dashboard + forward test (local)

The app in `dashboard/` runs **Binance futures testnet forward test** on your PC (not on Vercel).

- Enter **testnet API key + secret** → **Test API connection**
- Enable **fade-reversal** and/or **London mid winner** → **Start forward test**
- Keys are passed to Python in memory only (not written to disk)

Backtests stay on the CLI:

```bash
PYTHONPATH=. python3 -m aar backtest --config config.btc.london-mid-engulf-winner.toml
```

## Windows

```powershell
cd dashboard
.\run-dashboard.bat
```

Open http://127.0.0.1:43123 (or port from your START-HERE bat).

## Python pieces

- `tools/binance_api_probe.py` — test keys  
- `tools/forward_test_run.py` — poll testnet klines + strategy signals  
- `aar/live/binance_testnet.py` — signed REST (testnet default)
