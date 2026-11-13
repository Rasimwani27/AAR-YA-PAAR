# Forward test without keeping your laptop on

**Vercel cannot do this.** It has no always-on Python process. The online site only checks Binance keys and shows positions when you open it.

To run **Start forward test** / strategy ticks 24/7, something else must stay on: a **small cloud VPS** (or a home mini-PC / Raspberry Pi).

## Recommended: $4–6/month Linux VPS

Providers: Hetzner, DigitalOcean, Linode, Vultr, Oracle Cloud free tier (if available), etc.

### What you run on the VPS

1. Clone or upload your **AAR-YA-PAAR** folder (same as after unzip).
2. Install **Node 20+**, **Python 3**, `npm install` in `dashboard/`.
3. Set testnet keys (never commit these):

```bash
export BINANCE_API_KEY="your_testnet_key"
export BINANCE_API_SECRET="your_testnet_secret"
export AAR_REPO_ROOT="/home/you/AAR-YA-PAAR"
```

4. **Forward engine** (polls every 90s, writes `out/forward/state.json`):

```bash
cd /home/you/AAR-YA-PAAR
python3 tools/forward_test_run.py \
  --configs "fade-reversal:config.btc.fade-reversal-ny-trend.toml,london-mid-engulf:config.btc.london-mid-engulf-winner.toml" \
  --poll-seconds 90
```

Keep this running with **systemd** or **tmux** so it survives logout.

5. **Dashboard** (optional, for browser UI on the VPS):

```bash
cd dashboard
npm run serve:alt
# open http://YOUR_VPS_IP:43123 (lock down firewall / use SSH tunnel)
```

### systemd example (engine only)

File `/etc/systemd/system/aar-forward.service`:

```ini
[Unit]
Description=AAR forward test (Binance testnet)
After=network.target

[Service]
Type=simple
User=you
WorkingDirectory=/home/you/AAR-YA-PAAR
Environment=BINANCE_API_KEY=...
Environment=BINANCE_API_SECRET=...
Environment=AAR_REPO_ROOT=/home/you/AAR-YA-PAAR
ExecStart=/usr/bin/python3 tools/forward_test_run.py --configs fade-reversal:config.btc.fade-reversal-ny-trend.toml,london-mid-engulf:config.btc.london-mid-engulf-winner.toml --poll-seconds 90
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Then: `sudo systemctl enable --now aar-forward`

### Security

- Use **testnet** keys only on a VPS unless you harden the server.
- Restrict port **43123** to your IP or use SSH tunnel:  
  `ssh -L 43123:127.0.0.1:43123 you@your-vps`
- Do not store keys in GitHub.

## What you can keep on Vercel

- Portfolio PDF, download zip, **Binance key test** when you visit the site.
- Not a substitute for the engine above.

## Cheapest “no laptop” combo

| Piece | Where |
|--------|--------|
| 24/7 forward test | Linux VPS + `forward_test_run.py` (systemd) |
| Check keys / UI sometimes | Vercel **or** VPS dashboard on :43123 |
| Your laptop | Off |

There is no free always-on forward test on Vercel alone; a small VPS is the standard fix.
