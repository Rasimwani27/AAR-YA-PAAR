# Tailscale connected but browser "Can't reach this site"

Both devices **Connected** in Tailscale is only step 1. The dashboard must be running and Windows must allow port **43123**.

## Checklist (on the **old Windows 10 PC**)

1. **START-HERE-43123.bat** is running → npm window shows **Ready**
2. On that same PC, browser: **http://127.0.0.1:43123/api/ping**  
   → must show `"ok":true`
3. **Firewall** (Admin PowerShell once, from project folder):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\open-firewall-43123.ps1
   ```

4. Double-click **`scripts\CHECK-TAILSCALE-ACCESS.bat`** — fix anything red

## On your phone

1. Tailscale app **ON**, same account
2. Use the **old PC's** Tailscale IP (starts with **100.**) — **not** the phone's IP  
   Find it: Tailscale app → Machines → Windows 10 PC, or `tailscale ip -4` on the PC
3. URL must be exactly:

   ```text
   http://100.x.y.z:43123
   ```

   - **http** (not https)
   - include **:43123**
   - no `www`, no spaces

4. Test first: **http://100.x.y.z:43123/api/ping**

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Dashboard not started | Run START-HERE-43123.bat |
| Wrong IP | Use **PC** 100.x, not phone |
| Forgot port | Add **:43123** |
| Used https | Use **http://** |
| Firewall | Run open-firewall-43123.ps1 as Admin |

## Tailscale IP on the **same** old PC often fails (normal)

On Windows, opening `http://100.x.x.x:43123` **on the old PC itself** often shows
**Can't reach this site** even when everything is correct.

| Where you test | URL |
|----------------|-----|
| **On the old PC** | **http://127.0.0.1:43123/api/ping** only |
| **On phone** (Tailscale on) | **http://100.x.x.x:43123/api/ping** (PC's Tailscale IP) |

If **127.0.0.1** works on the PC but **100.x on the phone** fails, try **Tailscale Serve** (easier):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tailscale-serve-dashboard.ps1
```

Then on the phone open the **https://your-pc-name.tail****.ts.net** URL that Tailscale prints.

## Still failing?

Run `netstat -an | findstr 43123` on the PC — you want `0.0.0.0:43123` **LISTENING**.

On phone Tailscale app: ping the PC.  
If ping works but browser fails → firewall / dashboard not on 43123 / wrong URL.
