# Update `C:\Users\shady\AAR-YA-PAAR` on your PC

## Option 0 — Clone Cursor agent project into your folder (full dashboard + scripts)

```powershell
cd C:\Users\shady\AAR-YA-PAAR
powershell -ExecutionPolicy Bypass -File .\scripts\clone-cursor-project-to-local.ps1
```

Target defaults to **`C:\Users\shady\AAR-YA-PAAR`**. See `docs/GET_DASHBOARD.md` if git auth fails.

---

You **cannot** `git fetch` from Cursor’s cloud URL in PowerShell without Cursor/git credentials. Use one of these:

## Option 1 — Run the apply script (easiest)

1. Copy this repo onto your PC (USB, zip from Cursor, or `git pull` from **GitHub only**).
2. Open PowerShell:

```powershell
cd C:\Users\shady\AAR-YA-PAAR
powershell -ExecutionPolicy Bypass -File .\scripts\apply-to-local.ps1 -Target "C:\Users\shady\AAR-YA-PAAR"
```

If the script lives in a **downloaded copy** of the agent repo:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\path\to\agent-repo\scripts\apply-to-local.ps1" -Target "C:\Users\shady\AAR-YA-PAAR"
```

## Option 2 — Manual (no Cursor git)

In **`C:\Users\shady\AAR-YA-PAAR`** create/update:

### `dashboard\vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "env": {
    "AAR_DISABLE_EXEC": "1"
  }
}
```

### `dashboard\package.json` — `scripts.dev`

```json
"dev": "next dev --hostname 127.0.0.1 --port 3000 --webpack"
```

### Vercel website

- **Root Directory:** `dashboard`
- **Redeploy**

### Push to GitHub

```powershell
cd C:\Users\shady\AAR-YA-PAAR
git remote add origin https://github.com/Rasimwani27/AAR-YA-PAAR.git
git add dashboard\vercel.json docs\DEPLOY_VERCEL.md
git commit -m "Vercel: root directory dashboard + vercel.json"
git push -u origin main
```

## Option 3 — GitHub only workflow

1. Push fixes from any machine that has this repo to GitHub.
2. On your PC:

```powershell
cd C:\Users\shady\AAR-YA-PAAR
git pull origin main
```
