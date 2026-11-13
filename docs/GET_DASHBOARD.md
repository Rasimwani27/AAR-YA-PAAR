# Where to get the full `dashboard` folder

GitHub **Rasimwani27/AAR-YA-PAAR** on `main` currently has only **`dashboard/vercel.json`**, not the Next.js app. That is why Vercel shows “page doesn’t exist.”

The **complete** dashboard lives in the **Cursor agent project** (this repo), not on public GitHub yet.

## Recommended — clone agent into `C:\Users\shady\AAR-YA-PAAR`

On your PC, open PowerShell. If you already have this repo (or the script) locally:

```powershell
cd C:\Users\shady\AAR-YA-PAAR
powershell -ExecutionPolicy Bypass -File .\scripts\clone-cursor-project-to-local.ps1
```

Default target is **`C:\Users\shady\AAR-YA-PAAR`**. The script clones the Cursor git repo to a temp folder, then merges **`dashboard`**, **`scripts`**, **`docs`**, **`aar`**, etc. into that path (skips `node_modules` / `.next`, keeps your existing `.git`).

If you do **not** have the script yet, download/copy the agent repo once, or run from any folder:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\path\to\agent\scripts\clone-cursor-project-to-local.ps1" -Target "C:\Users\shady\AAR-YA-PAAR"
```

If `git clone` fails with auth, use **Option A** below (copy `dashboard` from the Cursor file tree).

## Option A — Copy from Cursor (easiest if you use the agent)

1. Open the **Cloud Agent** run that built AAR-YA-PAAR (same chat where you see file changes).
2. In the file tree, open folder **`dashboard`** — you should see:
   - `app/page.tsx`, `app/layout.tsx`
   - `package.json`, `next.config.ts`, `vercel.json`
   - `run-dashboard.bat`, `public/`, etc.
3. Copy that entire **`dashboard`** folder into  
   `C:\Users\shady\AAR-YA-PAAR\dashboard`  
   (replace/merge; keep your local `config.toml` and `aar/` at repo root untouched).

## Option B — Git clone the Cursor repo (full project)

If your Cursor account can access the agent git URL:

```powershell
cd $env:USERPROFILE\Downloads
git clone https://origin.cursor.com/git/calcul8/tmp-d98a4a3980b8c984.git aar-agent-copy
```

Then copy:

```powershell
robocopy "$env:USERPROFILE\Downloads\aar-agent-copy\dashboard" "C:\Users\shady\AAR-YA-PAAR\dashboard" /E /XD node_modules .next
copy "$env:USERPROFILE\Downloads\aar-agent-copy\scripts\verify-before-push.ps1" "C:\Users\shady\AAR-YA-PAAR\scripts\" 
copy "$env:USERPROFILE\Downloads\aar-agent-copy\docs\DEPLOY_VERCEL.md" "C:\Users\shady\AAR-YA-PAAR\docs\"
```

If `git clone` asks for a password, use a **Cursor git credential** or clone from the Cursor UI (Settings → Git / agent export). Plain GitHub login will **not** work for `origin.cursor.com`.

## Option C — Push from the agent, then pull on your PC

After the agent (or you) pushes **`dashboard/`** to GitHub:

```powershell
cd C:\Users\shady\AAR-YA-PAAR
git pull origin main
```

On GitHub you should then see **many files** under `dashboard/`, not just `vercel.json`.

## Verify you have the real app

```powershell
dir C:\Users\shady\AAR-YA-PAAR\dashboard\app\page.tsx
dir C:\Users\shady\AAR-YA-PAAR\dashboard\package.json
```

Both must exist. Then:

```powershell
cd C:\Users\shady\AAR-YA-PAAR\dashboard
.\run-dashboard.bat
```

Browser: http://127.0.0.1:3000 — should show **“Dashboard is live”**.

## What is *not* the full dashboard

- **`C:\Users\shady\AAR-YA-PAAR\dashboard\vercel.json` only** — incomplete.
- **GitHub `main` today** — same, only `vercel.json` until you push the full folder.
