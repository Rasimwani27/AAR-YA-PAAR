# Bybit demo + forward test (Hyro path)

HyroTrader’s **Bybit** challenges use **Bybit demo trading** keys and USDT linear perps. This repo now supports that alongside **Binance futures testnet**.

## Keys

1. Log in to [Bybit](https://www.bybit.com/).
2. Switch to **Demo Trading** (see [Bybit demo API docs](https://bybit-exchange.github.io/docs/v5/demo)).
3. Create **API key + secret** from the demo account (not mainnet keys for prod).

## Environment

| Variable | When |
|----------|------|
| `BYBIT_API_KEY` / `BYBIT_API_SECRET` | `--exchange bybit` |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | `--exchange binance` (default) |
| `AAR_FORWARD_EXCHANGE` | Optional default: `binance` or `bybit` |

## CLI

```bash
cd "path/to/AAR-YA-PAAR"
set BYBIT_API_KEY=...
set BYBIT_API_SECRET=...
PYTHONPATH=. python3 tools/bybit_api_probe.py

PYTHONPATH=. python3 tools/forward_test_run.py --exchange bybit ^
  --configs london:config.btc.london-mid-engulf-winner.toml --once --skip-probe
```

Continuous loop: omit `--once` (polls every 60s by default).

## Dashboard (local :43123)

1. Open **Forward test** panel.
2. Select **Bybit demo (Hyro path)**.
3. Paste demo keys → **Test Bybit demo API**.
4. **Start forward test** (same paper ledger + signals as Binance; positions shown from Bybit demo account).

### Geo / hosting (403 CloudFront “block access from your country”)

Bybit’s edge sometimes **rejects requests from certain regions or datacenter IPs** (common on **Vercel** and cloud VMs). That is not a bad API key; the **same** probe works from a normal **home** network. Use **local** `START-HERE-43123.bat` (or `npm run dev` in `dashboard/`) for Bybit demo testing, then ship the UI to Vercel; hosted mode does not rely on Bybit from the server for forward test.

## Behaviour

- **Klines / mark price**: Bybit **public** mainnet API (`api.bybit.com`) — same live prices the exchange uses.
- **Wallet / positions**: **Signed** calls to `https://api-demo.bybit.com` with your demo keys.
- **Orders**: not placed automatically; forward test is **signal + paper ledger** unless you extend the script.

## HyroTrader

After this works on Bybit demo, use the **same** API keys and stack Hyro documents for their Bybit challenge — no extra “Hyro API” in this repo.
