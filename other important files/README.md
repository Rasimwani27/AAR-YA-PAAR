# AAR-YA-PAAR

## Update local PC (`C:\Users\shady\AAR-YA-PAAR`)

See **[LOCAL_UPDATE.md](LOCAL_UPDATE.md)** and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-to-local.ps1 -Target "C:\Users\shady\AAR-YA-PAAR"
```

## Vercel 404 fix

Set **Root Directory = `dashboard`**. See [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

---

# AAR dashboard (local dev fix)

## Upload to GitHub

This environment cannot push to your GitHub account directly. On your PC:

```powershell
# Clone what Cursor has (or use your existing folder), then:
cd path\to\this\repo
gh auth login
powershell -ExecutionPolicy Bypass -File .\scripts\push-to-github.ps1 -Owner Rasimwani27 -Repo AAR-YA-PAAR
```

Or if the repo already exists on GitHub:

```powershell
git remote add github https://github.com/Rasimwani27/AAR-YA-PAAR.git
git push -u github main
```

Cursor copy of this project: `origin` → `https://origin.cursor.com/git/calcul8/tmp-d98a4a3980b8c984.git`

---

# Dashboard local fix (ERR_EMPTY_RESPONSE / connection reset)

On Windows, Next.js sometimes binds badly or Turbopack returns an empty response. Use:

```powershell
cd dashboard
.\run-dashboard.bat
```

Or from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fix-local-dashboard.ps1
```

Open **http://127.0.0.1:3000** (not `https://`).

If you use the full **AAR-YA-PAAR** repo, copy these into your clone:

- `dashboard/run-dashboard.bat`
- `scripts/fix-local-dashboard.ps1`
- In `dashboard/package.json`, set `"dev"` to:
  `"next dev --hostname 127.0.0.1 --port 3000 --webpack"`

Then delete `dashboard\.next`, run `npm install`, and start with `run-dashboard.bat`.
