# Forward test: Job running then Job error

**Test Binance testnet API** uses **Node.js**. **Start forward test** uses **Python** on your PC.

If the job flips to **error** in a second, the dashboard now shows the **red reason** under Job status.

## Checklist

1. **Test Binance** must succeed first (same keys).
2. Install **Python 3.11+** from https://www.python.org/downloads/ — tick **Add python.exe to PATH**.
3. In cmd: `py -3 --version` or `python --version` must work.
4. Restart **START-HERE-43123.bat** after installing Python.
5. Click **Run one tick** — if that fails, read the error (same as forward test startup).
6. Log file: `out\forward\forward.stderr.log` in your project folder.

## Common errors

| Message | Fix |
|---------|-----|
| Python not found | Install Python, restart bat |
| Timestamp / -1021 | Sync Windows clock (Settings -> Time -> Sync now) |
| API-key format invalid | Use **Futures testnet** keys from testnet.binancefuture.com |
| missing config.*.toml | Re-extract full **AAR-YA-PAAR.zip** |
| ZoneInfoNotFoundError Asia/Kolkata | Update project (latest zip) or `py -3 -m pip install tzdata` |
