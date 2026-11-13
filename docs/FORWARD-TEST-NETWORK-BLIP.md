# Heartbeats then `getaddrinfo failed`

Those lines in the npm/cmd window are **normal** while forward test runs:

```json
{"heartbeat": "...", "results": 2}
```

`results: 2` = both strategies ticked each cycle (~90 seconds).

If you then see:

```json
{"ok": false, "error": "<urlopen error [Errno 11001] getaddrinfo failed>"}
```

the **old PC briefly lost DNS** (could not resolve `testnet.binancefuture.com` or `data.binance.vision`). That is a **network/router/Wi‑Fi** hiccup, not bad API keys.

## What to do

1. **Start forward test** again in the dashboard (or restart `START-HERE-43123.bat`).
2. On the old PC:
   - Use **Ethernet** if possible
   - Settings → Network → DNS: try **1.1.1.1** or **8.8.8.8**
   - Avoid sleep; keep router on
3. Latest project **retries** on DNS blips instead of stopping the whole job.

## Still running?

Check `out\forward\state.json` — if `updated_at` is recent, ticks are still saving even if the cmd window printed an error (after update).
