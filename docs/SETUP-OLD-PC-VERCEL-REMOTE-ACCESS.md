# Old PC + Vercel dashboard + access from outside

## How it fits together

| Piece | Where it runs | Job |
|--------|----------------|-----|
| **Forward test engine** (Python) | Old PC at home, 24/7 | Strategies, ticks, paper trades |
| **Dashboard UI** | **Vercel** (optional) | Same lab in the browser |
| **API / engine backend** | Old PC `:43123` | Must be reachable from the internet (tunnel) |
| **Binance key test only** | Vercel alone | Works without home PC |

Vercel **cannot** run Python. The old PC runs the engine; Vercel only shows the UI and forwards API calls to your home tunnel.

---

## Part A — Old PC (one-time)

1. **Extract project** to `C:\AAR-YA-PAAR` (from `AAR-YA-PAAR.zip`).

2. **Power:** Windows → sleep **Never** when plugged in.

3. **Test locally:** double-click **`START-HERE-43123.bat`**, wait for **Ready**, open  
   `http://127.0.0.1:43123/api/ping` → must show `"ok":true`.

4. **Firewall** (Admin PowerShell once):
   ```powershell
   New-NetFirewallRule -DisplayName "AAR 43123" -Direction Inbound -LocalPort 43123 -Protocol TCP -Action Allow
   ```

5. **Auto-start after reboot:**  
   `Win+R` → `shell:startup` → shortcut to `START-HERE-43123.bat` → **Run: Minimized**.

6. **Environment for CORS** (so Vercel can call your PC): create  
   `C:\AAR-YA-PAAR\dashboard\.env.local`:
   ```env
   AAR_REPO_ROOT=C:\AAR-YA-PAAR
   AAR_CORS_ORIGIN=https://YOUR-PROJECT.vercel.app
   ```
   Replace with your real Vercel URL (no trailing slash).

7. Restart **`START-HERE-43123.bat`** after creating `.env.local`.

---

## Part B — Reach home from outside (pick one)

### Option 1 — Cloudflare Tunnel (best for Vercel + phone browser)

1. Create free account at [cloudflare.com](https://cloudflare.com).
2. Install **cloudflared** on the old PC: [developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation)
3. Create a tunnel that forwards to **`http://127.0.0.1:43123`**.
4. You get a public HTTPS URL, e.g. **`https://aar-home.yourdomain.com`** (or a free `*.trycloudflare.com` URL for testing).

5. Test from your phone (Wi‑Fi off, use mobile data):  
   `https://aar-home.yourdomain.com/api/ping`

Keep **cloudflared** running on the old PC (install as a Windows service so it survives reboot).

### Option 2 — Tailscale (easiest, private; full lab without Vercel)

1. Install [Tailscale](https://tailscale.com) on old PC + phone + laptop.
2. On old PC, note Tailscale IP (e.g. `100.x.y.z`).
3. From anywhere: **`http://100.x.y.z:43123/`** — full dashboard, no Vercel.

Use this if you do not need the Vercel URL; skip Part C.

---

## Part C — Vercel as dashboard

1. Deploy **`dashboard/`** to Vercel (Root Directory = **`dashboard`**).

2. Vercel → Project → **Settings → Environment Variables**:
   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_AAR_API_URL` | `https://aar-home.yourdomain.com` (your Cloudflare tunnel URL, **no** trailing slash) |
   | `AAR_DISABLE_EXEC` | `1` (already in vercel.json; engine stays on home PC) |

3. **Redeploy** production.

4. Open **`https://YOUR-PROJECT.vercel.app`** → credentials → **Test Binance** / **Start forward test**  
   API calls go to your old PC via the tunnel.

5. On the old PC, **leave** `START-HERE-43123.bat` running and start forward test once (or use Task Scheduler for Python only — see `scripts/install-home-pc-task.ps1`).

---

## Part D — Daily use

| You are… | Do this |
|----------|---------|
| At home | `http://192.168.x.x:43123` or Vercel URL |
| Outside | Vercel URL **or** Tailscale / Cloudflare URL |
| Old PC off | Forward test **stopped**; Vercel still does Binance key test only |

---

## Checklist

- [ ] Old PC: `START-HERE-43123.bat` running 24/7  
- [ ] Tunnel or Tailscale working → `/api/ping` OK from mobile data  
- [ ] `dashboard\.env.local` has `AAR_CORS_ORIGIN` = Vercel URL  
- [ ] Vercel has `NEXT_PUBLIC_AAR_API_URL` = tunnel URL  
- [ ] Redeployed Vercel after env change  

---

## Security

- Use **Binance testnet** keys on the server unless you fully trust your tunnel.
- Do not port-forward 43123 on the router without a VPN; prefer **Cloudflare Tunnel** or **Tailscale**.
- Never commit API keys or `.env.local` to GitHub.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Vercel UI, “could not reach API” | Check tunnel up; `NEXT_PUBLIC_AAR_API_URL` correct; CORS origin matches Vercel URL |
| CORS error in browser console | Fix `AAR_CORS_ORIGIN` on old PC, restart bat |
| Mixed content blocked | Tunnel must be **https://** if Vercel is https |
| Engine idle | Old PC cmd closed → reopen `START-HERE-43123.bat` |

See also: `docs/RUN-ON-OLD-PC-AT-HOME.md`
