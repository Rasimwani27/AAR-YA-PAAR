# Repair local dashboard + verify Python backtest (run from repo root).
param(
  [string]$Root = ""
)

$ErrorActionPreference = "Stop"
if (-not $Root) {
  $Root = Split-Path $PSScriptRoot -Parent
}

Set-Location $Root

Write-Host "=== AAR local fix ===" -ForegroundColor Cyan
Write-Host "Root: $Root"

Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

$dash = Join-Path $Root "dashboard"
if (-not (Test-Path (Join-Path $dash "package.json"))) {
  Write-Error "Missing dashboard\package.json — run scripts\apply-to-local.ps1 or git pull full repo"
}
if (-not (Test-Path (Join-Path $Root "aar\__main__.py"))) {
  Write-Error "Missing aar\ package in repo root — copy full AAR-YA-PAAR, not dashboard alone"
}

Write-Host "npm install in dashboard..."
Set-Location $dash
$envLocal = Join-Path $dash ".env.local"
@"
AAR_REPO_ROOT=$Root
AAR_NO_REST=1
"@ | Set-Content -Path $envLocal -Encoding utf8
Write-Host "Wrote $envLocal"
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }

$py = $null
foreach ($cmd in @("py -3", "python", "python3")) {
  try {
    & cmd /c "$cmd --version" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $py = $cmd; break }
  } catch {}
}
if (-not $py) {
  Write-Host "Install Python 3.11+ from https://www.python.org/downloads/" -ForegroundColor Red
  exit 1
}
Write-Host "Python OK: $py"
if ($py -match "^py") { $env:AAR_PYTHON = "py" } else { $env:AAR_PYTHON = $py.Split(" ")[0] }

Set-Location $Root
$env:AAR_NO_REST = "1"
Remove-Item Env:AAR_DISABLE_EXEC -ErrorAction SilentlyContinue

Write-Host "Backtest JSON smoke (engine + analytics)..."
$smoke = Join-Path $Root "config.btc.smoke.toml"
$report = Join-Path $Root "tools\year_by_year_report.py"
& cmd /c "$py `"$report`" --config `"$smoke`" --format json" | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "year_by_year_report failed — need tools\trade_analytics.py and aar\" -ForegroundColor Red
  exit 1
}
Write-Host "Engine JSON OK" -ForegroundColor Green

Write-Host ""
Write-Host "Start dashboard:" -ForegroundColor Green
Write-Host "  cd `"$dash`""
Write-Host "  .\run-dashboard-43123.bat   (port 43123 — recommended if you use that URL)"
Write-Host "  .\run-dashboard.bat           (port 3000)"
Write-Host ""
Write-Host "Open http://127.0.0.1:43123 or :3000 — badge should show Engine ready."
