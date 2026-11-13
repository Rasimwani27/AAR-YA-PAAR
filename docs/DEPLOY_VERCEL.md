# Fix Vercel “This page doesn’t exist” / NOT_FOUND

Vercel shows **404**, **NOT_FOUND**, or **“The page could not be found”** when the deployment has **no working Next.js app** at the path Vercel builds.

## Cause (most common for this repo)

GitHub **`main`** often had only `dashboard/vercel.json` and **not** the rest of the app (`package.json`, `app/`, etc.). Vercel then has nothing valid to serve → **404 on every URL**.

## Fix (do in order)

### 1. Put the full dashboard on your PC

From a copy of this agent repo (or after `git pull` if it’s on GitHub):

```powershell
cd C:\Users\shady\AAR-YA-PAAR
powershell -ExecutionPolicy Bypass -File .\scripts\apply-to-local.ps1 -Target "C:\Users\shady\AAR-YA-PAAR"
```

Or copy the entire **`dashboard`** folder manually (must include `app\`, `package.json`, `next.config.ts`, `vercel.json`).

Verify:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-before-push.ps1 -Root "C:\Users\shady\AAR-YA-PAAR"
```

### 2. Push to GitHub

```powershell
cd C:\Users\shady\AAR-YA-PAAR
git add dashboard
git status
git commit -m "Add full dashboard app for Vercel"
git push -u origin main
```

On [github.com/Rasimwani27/AAR-YA-PAAR](https://github.com/Rasimwani27/AAR-YA-PAAR) you should see **`dashboard/app/page.tsx`** and **`dashboard/package.json`**, not just `vercel.json`.

### 3. Vercel project settings

1. [vercel.com](https://vercel.com) → your **AAR-YA-PAAR** project  
2. **Settings** → **General** → **Root Directory** → **`dashboard`**  
3. **Save**  
4. **Deployments** → latest → **⋯** → **Redeploy** (use **Production**)

Do **not** set a custom **Output Directory** (leave default for Next.js).

### 4. Confirm the deployment

- **Deployments** tab: latest build = **Ready** (not Error).  
- Open the **Production** URL (e.g. `https://your-project.vercel.app/`).  
- You should see **“AAR-YA-PAAR — Dashboard is live”**.

If build **fails**, open the build log; usually missing `package.json` or wrong root directory.

### TypeScript build error (deploy stops after `npm install`)

If the log shows **Running TypeScript** then **Failed to type check** with errors in `app/api/backtest/route.ts`, update that file so `start` and `end` are typed as `string` (not `as const` literals). Fixed in repo: `let start: string = DEFAULT_RANGE.start;`

Yellow `npm warn` lines and `6 high severity vulnerabilities` are warnings — they do **not** by themselves stop the deploy; look for **red** `Failed to compile` / `Failed to type check`.

## Local vs Vercel

| Issue | Symptom | Fix |
|--------|---------|-----|
| Local | `ERR_CONNECTION_REFUSED` on `127.0.0.1:3000` | Run `dashboard\run-dashboard.bat`; keep terminal open |
| Vercel | 404 / page doesn’t exist | Full `dashboard/` on GitHub + Root Directory = `dashboard` + redeploy |
| Vercel | Missing `aar` at `/var/task` | **Expected** — Vercel only deploys `dashboard/`. Hosted mode serves static AFNY results + PDF/zip links; backtests run on your PC only. |

## Environment (optional)

| Variable | Value |
|----------|--------|
| `AAR_DISABLE_EXEC` | `1` (set in `dashboard/vercel.json`) |

Python backtests do not run on Vercel; use local `run-dashboard.bat` + `aar` package.
