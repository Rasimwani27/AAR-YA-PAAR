# Dashboard connection errors

## ERR_CONNECTION_REFUSED (-102) on /api/ping

**Meaning:** Nothing is listening on that port. The dev server is **not running** (or never started on that port).

| URL | You must run |
|-----|----------------|
| http://127.0.0.1:3000 | `START-HERE.bat` or `cd dashboard` → `npm run serve` |
| http://127.0.0.1:43123 | `START-HERE-43123.bat` or `npm run serve:alt` from repo root |

## Buttons do nothing (page looks loaded, no “Engine OK”, links work)

**Cause:** `next dev` can leave the page as **static HTML without React** — clicks on **Test dashboard connection** never run.

**Fix:** Use the **production** scripts (default in `START-HERE*.bat` now): `npm run serve` or `npm run serve:alt`. Wait for **Ready**, hard-refresh the lab tab (Ctrl+F5). Header should change from **Checking…** to **Forward test ready**.

Opening 43123 while only `START-HERE.bat` / port **3000** is running will **always** refuse — that is expected (two different ports, one process).

**Fastest checks (30 seconds):**

1. Double-click `scripts\CHECK-SERVER.bat` — it prints **LISTEN** vs **(nothing listening)** and **ping OK/FAIL** for **both** 3000 and 43123.
2. If 43123 shows nothing listening but 3000 ping OK → use http://127.0.0.1:3000 or start the alt port: `START-HERE-43123.bat`.
3. If **both** fail → run `START-HERE.bat`, keep the **cmd** window open, read red errors; open `dashboard\dashboard-start.log`.

**Fix:** Double-click `START-HERE.bat` (3000) or `START-HERE-43123.bat` (43123) and **leave the npm window open** until the script says SUCCESS.

---

## "Could not reach /api/backtest" on :43123 after a long wait

**Often a false alarm.** The backtest may still be running in the **npm/cmd** window; the browser lost the polling connection (common on Windows during 10–20 minute runs).

1. Open **http://127.0.0.1:43123/api/ping** (same port as the lab). If `ok:true`, the server is fine.
2. Check the npm window for Python still running.
3. When it finishes, **run the same date range again** — results are cached under `out/reports/` and `out/cache/`.
4. Pull latest dashboard code for resilient polling + correct :43123 messages.

---

## Port listens but ping FAIL on 3000 (43123 OK)

Example: `Port 3000 listen=True` + `ping FAIL`, while `43123` returns `{"ok":true,"service":"aar-dashboard"}`.

**Meaning:** Something is bound to **3000**, but it is **not** the backtest dashboard (often the **repo-root** Next app from running `next dev` in the wrong folder, or another tool).

**What to do:**

1. **Use the working port:** open **http://127.0.0.1:43123/** for the lab (your screenshot already proves the engine UI is there).
2. **Optional — clean up 3000:**

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
cd C:\Users\shady\AAR-YA-PAAR
.\START-HERE.bat
```

Only start the lab via **`START-HERE.bat`**, **`START-HERE-43123.bat`**, or `cd dashboard` then `npm run dev` / `npm run dev:alt` — not `next dev` from the repo root.

---

# ERR_EMPTY_RESPONSE on http://127.0.0.1:3000

**Browser:** `Connection was reset` / `ERR_EMPTY_RESPONSE` (-324)

## Most likely causes (in order)

1. **Browser opened before Next.js is ready**  
   The dev server is still compiling; the socket closes with no HTTP body.  
   **Fix:** Wait until the terminal shows **Ready**, then open the URL (or refresh once).

2. **Wrong or dead process on port 3000**  
   Another app (or a crashed Node) holds the port and does not speak HTTP.  
   **Fix:** Kill port 3000, restart dashboard (see below).

3. **Next.js dev crash on startup**  
   Corrupt `.next` cache or bad `node_modules`.  
   **Fix:** Delete `dashboard\.next`, run `npm install`, `npm run dev` again.

4. **Turbopack glitch (Windows)**  
   Use webpack only: `npm run dev` already passes `--webpack`. Keep `NEXT_DISABLE_TURBOPACK=1`.

5. **Not the dashboard app**  
   Running `next dev` from repo root without `dashboard/` can serve a stub with no APIs.  
   **Fix:** Always start from `dashboard\run-dashboard.bat` or `START-HERE.bat`.

## Fastest checks (2 minutes)

```powershell
cd C:\Users\shady\AAR-YA-PAAR
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-dashboard.ps1
```

1. Is anything listening on **3000**? (doctor shows PID + process name)  
2. Does **http://127.0.0.1:3000/api/ping** return JSON in PowerShell?  
   - If **FAIL** here, the browser will fail too — fix the server first.  
3. In the **npm terminal**, do you see **Ready** or a red stack trace?

## Clean restart

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
cd C:\Users\shady\AAR-YA-PAAR\dashboard
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm install
npm run dev
```

Wait for **Ready**, then: http://127.0.0.1:3000/api/ping

## Alternate port (if 3000 stays broken)

```powershell
cd dashboard
npm run dev:alt
```

Open http://127.0.0.1:43123/api/ping
