# Run AAR-YA-PAAR locally (no Vercel)

Vercel is **optional hosting** for a read-only UI shell. Your **real setup** is:

- **Python** `aar` backtests on your PC  
- **Dashboard** at `http://127.0.0.1:3000` talking to Python **only when running locally**

You do **not** need Vercel, GitHub Pages, or the cloud agent to trade or backtest.

---

## Step 1 — Get the full folder on `C:\Users\shady\AAR-YA-PAAR`

### If you still have the OLD full project on this PC

Check for these (full engine from your screenshot / HANDOFF):

```
C:\Users\shady\AAR-YA-PAAR\tools\audit_trades.py
C:\Users\shady\AAR-YA-PAAR\tests\
C:\Users\shady\AAR-YA-PAAR\aar\backtest\report.py
```

If those exist, **keep that folder** — that is the engine that produced **+1,890%** table (3% risk, SL 600, 1:20).

### If the folder is incomplete (only `dashboard\vercel.json` or missing `aar\`)

Use **one** of:

**A) Cursor agent zip** (from Preview download when agent was running):

- Unzip `AAR-YA-PAAR-full.zip` **into** `C:\Users\shady\AAR-YA-PAAR` (merge).

**B) Clone Cursor git** (if auth works):

```powershell
cd $env:USERPROFILE\Downloads
git clone https://origin.cursor.com/git/calcul8/tmp-d98a4a3980b8c984.git aar-agent
robocopy "$env:USERPROFILE\Downloads\aar-agent\AAR-YA-PAAR" "C:\Users\shady\AAR-YA-PAAR" /E /XD node_modules .next .git out\cache
```

**C) GitHub** (after you push the full repo):

```powershell
cd C:\Users\shady\AAR-YA-PAAR
git pull origin main
```

---

## Step 2 — Install once

**Python 3.11+** from [python.org](https://www.python.org/downloads/) — tick **Add to PATH**.

**Node.js LTS** from [nodejs.org](https://nodejs.org/) (for dashboard only).

```powershell
cd C:\Users\shady\AAR-YA-PAAR\dashboard
npm install
```

No `pip install` — the engine uses the Python standard library only.

---

## Step 3 — Run locally (every day)

Double-click or run:

```powershell
cd C:\Users\shady\AAR-YA-PAAR
powershell -ExecutionPolicy Bypass -File .\scripts\run-local-windows.ps1
```

Or manually:

```powershell
# Terminal 1 — dashboard (leave open)
cd C:\Users\shady\AAR-YA-PAAR\dashboard
.\run-dashboard.bat

# Terminal 2 — backtest (same params as your portfolio table)
cd C:\Users\shady\AAR-YA-PAAR
$env:AAR_NO_REST = "1"
python tools\year_by_year_report.py --config config.btc.break-fade-3pct-1-20.toml
```

Browser: **http://127.0.0.1:3000** (not Vercel URL).

---

## Step 4 — Match your +1,890% table

Config file: **`config.btc.break-fade-3pct-1-20.toml`**

| Setting | Value |
|---------|--------|
| Risk | **3%** |
| SL | **$600** |
| Target | **$12,000** (1:20) |
| Period | **2021-08-01 → 2026-08-01** |

**Important:** Numbers will **only match your screenshot** if you use the **same engine** (full local `aar` with funding/fees/post-only). The smaller cloud copy may differ until you restore `tests/`, `audit_trades.py`, and full `engine.py` from your old PC or backup.

---

## Do NOT use Vercel for local work

- Ignore Vercel project URL for development.  
- In Vercel dashboard you can **pause** or disconnect the repo — it does not affect local runs.  
- `dashboard\vercel.json` only matters if you deploy; locally it is ignored.

---

## Find the old engine on this PC

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\shady\AAR-YA-PAAR\scripts\find-full-engine.ps1
```

Searches common locations for `audit_trades.py` (marker of the full HANDOFF codebase).
