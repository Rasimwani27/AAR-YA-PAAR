# Use an old PC at home as your “VPS” (24/7 forward test)

Same idea as a cloud VPS, but the server is your old computer on your home network. Your main laptop can stay off.

## What you need

- Old PC with **Windows 10/11** (what you already use with `START-HERE-43123.bat`)
- **Ethernet** to the router (more stable than Wi‑Fi for 24/7)
- Power settings: **never sleep** when plugged in
- Binance **testnet** API keys (same as now)

## Step 1 — Install the project on the old PC

1. Copy **`AAR-YA-PAAR.zip`** to the old PC (or sync from GitHub).
2. Extract to a simple path, e.g. `C:\AAR-YA-PAAR`
3. Confirm you see `START-HERE-43123.bat` and folder `dashboard`.

## Step 2 — Run the lab on the old PC

1. Double‑click **`START-HERE-43123.bat`**
2. Leave the **black cmd window open** (minimize is OK — do not close it)
3. On that same PC, open **http://127.0.0.1:43123/** and paste testnet keys
4. Click **Start forward test**

The Python engine runs inside that npm window. If you close the window, forward test stops.

## Step 3 — Stop the PC from sleeping

**Windows 11:** Settings → System → Power → Screen and sleep → When plugged in: **Never** for sleep.

**Windows 10:** Control Panel → Power Options → Change plan settings → Put computer to sleep: **Never**.

Also disable **Fast Startup** (optional but helps long‑running servers):

Control Panel → Power → Choose what power buttons do → uncheck **Turn on fast startup**.

## Step 4 — Start automatically when the old PC boots (optional)

1. Press `Win + R`, type `shell:startup`, Enter
2. Create a shortcut to **`C:\AAR-YA-PAAR\START-HERE-43123.bat`**
3. Shortcut → Properties → Run: **Minimized**

After a power cut, when the PC comes back you may need to log in once (unless you configure auto‑login — only do that if the PC is physically secure at home).

For **forward test only** (no browser UI), use Task Scheduler to run Python directly — see `scripts\install-home-pc-task.ps1` in the repo (runs engine on boot).

## Step 5 — Use the dashboard from your laptop (same house)

On your **main laptop**, open a browser:

```text
http://OLD-PC-IP:43123/
```

Find the old PC’s IP on the old PC: open cmd → `ipconfig` → **IPv4 Address** (often `192.168.1.x`).

**First time on the old PC:** Windows Firewall may ask to allow Node — click **Allow** on private networks.

If it does not connect, on the old PC (Admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName "AAR Dashboard 43123" -Direction Inbound -LocalPort 43123 -Protocol TCP -Action Allow
```

Only do this on your **home LAN**. Do not port‑forward 43123 to the internet unless you know how to secure it (VPN is safer).

## Step 6 — Access from outside home (optional)

Home PCs usually have a changing public IP. Options:

- **Tailscale** or **ZeroTier** (free): install on old PC + laptop → use virtual IP, no router port forwarding
- **Router port forward** + **Dynamic DNS** (advanced; lock dashboard to your IP or use strong auth — not built into this project)

For most users: **same Wi‑Fi / Tailscale** is enough.

## What runs where

| Task | Old PC (always on) | Main laptop | Vercel |
|------|-------------------|-------------|--------|
| Forward test engine | Yes | Off | No |
| Dashboard UI | Yes (:43123) | Browser only | Keys test only |
| Binance testnet | Yes | — | Optional |

## Checklist

- [ ] Old PC plugged in, sleep disabled  
- [ ] `START-HERE-43123.bat` running (or scheduled task)  
- [ ] Forward test started once (keys entered)  
- [ ] Laptop uses `http://192.168.x.x:43123` on home network  

## Troubleshooting

- **Stops after update reboot:** use Startup shortcut or Task Scheduler again  
- **“Connection refused” from laptop:** firewall rule, wrong IP, or cmd window closed  
- **High electric bill:** old PCs draw more than a $5 VPS — compare cost vs convenience  

See also: `docs/RUN-24-7-WITHOUT-LAPTOP.md` (cloud VPS alternative).
