# Clone the Cursor agent repo and merge into your local AAR-YA-PAAR folder.
# Run ON YOUR PC in PowerShell (not inside the cloud agent VM).
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\clone-cursor-project-to-local.ps1
#
# Default target: C:\Users\shady\AAR-YA-PAAR

param(
  [string]$Target = "C:\Users\shady\AAR-YA-PAAR",
  [string]$CursorRepo = "https://origin.cursor.com/git/calcul8/tmp-d98a4a3980b8c984.git"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Target)) {
  Write-Host "Creating $Target"
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$cloneDir = Join-Path $env:TEMP "aar-cursor-clone-$stamp"

Write-Host "Cloning Cursor project to: $cloneDir"
Write-Host "Repo: $CursorRepo"
Write-Host ""

if (Get-Command git -ErrorAction SilentlyContinue) {
  git clone --depth 1 $CursorRepo $cloneDir
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Git clone failed (auth is normal on first try)." -ForegroundColor Yellow
    Write-Host "Do ONE of the following:" -ForegroundColor Yellow
    Write-Host "  1. In Cursor: open this agent run -> copy the dashboard folder into $Target\dashboard"
    Write-Host "  2. Cursor Settings -> connect Git, then run this script again"
    Write-Host "  3. Clone from GitHub AFTER you push the full dashboard from a machine that has it"
    exit 1
  }
} else {
  Write-Error "Git is not installed. Install from https://git-scm.com/download/win"
}

Write-Host ""
Write-Host "Merging into: $Target"
Write-Host "(Keeps your existing .git if present; skips node_modules and .next)"
Write-Host ""

function Sync-Tree($name) {
  $src = Join-Path $cloneDir $name
  if (-not (Test-Path $src)) {
    Write-Host "  skip (not in agent repo): $name"
    return
  }
  $dst = Join-Path $Target $name
  if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
  }
  robocopy $src $dst /E /XD node_modules .next /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy failed for $name"
  }
  Write-Host "  OK $name"
}

@(
  "dashboard",
  "scripts",
  "docs",
  "app",
  "public",
  "aar"
) | ForEach-Object { Sync-Tree $_ }

# Root files from agent (do not overwrite local config if you already customized — copy with care)
$rootFiles = @(
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "vercel.json",
  "run-dashboard.bat",
  "README.md",
  "LOCAL_UPDATE.md"
)
foreach ($f in $rootFiles) {
  $src = Join-Path $cloneDir $f
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $Target $f) -Force
    Write-Host "  OK $f"
  }
}

# Agent copy of AAR-YA-PAAR nested project (Python + ETH configs)
$nested = Join-Path $cloneDir "AAR-YA-PAAR"
if (Test-Path $nested) {
  Write-Host ""
  Write-Host "Merging nested AAR-YA-PAAR/ (Python aar package, configs)..."
  robocopy $nested $Target /E /XD node_modules .next .git out/cache /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -lt 8) {
    Write-Host "  OK AAR-YA-PAAR/* merged into target"
  }
}

Write-Host ""
Write-Host "Cleaning temp clone..."
Remove-Item -Recurse -Force $cloneDir

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  1. Verify:  dir `"$Target\dashboard\app\page.tsx`""
Write-Host "  2. Local UI: cd `"$Target\dashboard`" ; .\run-dashboard.bat"
Write-Host "  3. Push GitHub so Vercel gets the full dashboard:"
Write-Host "       cd `"$Target`""
Write-Host "       git add dashboard scripts docs"
Write-Host "       git commit -m `"Add full dashboard from Cursor agent`""
Write-Host "       git push -u origin main"
