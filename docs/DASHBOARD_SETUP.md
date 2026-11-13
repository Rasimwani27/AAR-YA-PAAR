# Dashboard + forward test (local)

The app in `dashboard/` runs **forward test** on your PC (not on Vercel): **Bybit demo** (Hyro path) or **Binance futures testnet**.

- Choose **Bybit demo** or **Binance testnet** → paste keys → **Test … API**
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

- `tools/binance_api_probe.py` — test Binance keys  
- `tools/bybit_api_probe.py` — test Bybit **demo** keys  
- `tools/forward_test_run.py` — poll klines + strategy signals (`--exchange binance` or `--exchange bybit`)  
- `aar/live/binance_testnet.py` — Binance signed REST (testnet default)  
- `aar/live/bybit_demo.py` — Bybit v5 demo wallet + mainnet public klines  

See **[BYBIT-DEMO-FORWARD.md](./BYBIT-DEMO-FORWARD.md)** for Hyro / Bybit demo setup.
