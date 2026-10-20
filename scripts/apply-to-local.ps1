# Copy full local stack (engine + dashboard) into your AAR-YA-PAAR folder.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\apply-to-local.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\apply-to-local.ps1 -Target "C:\Users\shady\AAR-YA-PAAR"

param(
  [string]$Target = "C:\Users\shady\AAR-YA-PAAR"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path $Target)) {
  Write-Error "Target folder not found: $Target"
}

Write-Host "Updating: $Target"
Write-Host "From:     $RepoRoot"

function Copy-Tree($rel) {
  $src = Join-Path $RepoRoot $rel
  $dst = Join-Path $Target $rel
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing: $rel"
    return
  }
  if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
  }
  robocopy $src $dst /E /XD node_modules .next __pycache__ /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy failed copying $rel"
  }
  Write-Host "  OK $rel\"
}

Copy-Tree "dashboard"
Copy-Tree "aar"
Copy-Tree "tools"

Get-ChildItem (Join-Path $RepoRoot "config*.toml") -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $Target $_.Name) -Force
  Write-Host "  OK $($_.Name)"
}

@(
  "run-dashboard.bat",
  "docs\LOCAL_PC_SETUP.md",
  "docs\DEPLOY_VERCEL.md",
  "scripts\fix-local-dashboard.ps1",
  "scripts\push-to-github.ps1",
  "scripts\verify-before-push.ps1"
) | ForEach-Object {
  $src = Join-Path $RepoRoot $_
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing: $_"
    return
  }
  $dst = Join-Path $Target $_
  $dir = Split-Path $dst -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  Copy-Item $src $dst -Force
  Write-Host "  OK $_"
}

Write-Host ""
Write-Host "Done. On your PC:"
Write-Host "  cd $Target"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\fix-local-dashboard.ps1 -Root `"$Target`""
Write-Host "  cd dashboard"
Write-Host "  .\run-dashboard.bat"
