# One double-click flow: start dashboard if needed, then open /download in the browser.
param(
  [string]$Root = "",
  [int]$Port = 43123
)

$ErrorActionPreference = "Continue"
if (-not $Root) {
  $Root = Split-Path $PSScriptRoot -Parent
}

$downloadUrl = "http://127.0.0.1:${Port}/download"
$pingUrl = "http://127.0.0.1:${Port}/api/ping"

function Test-DashboardUp {
  try {
    $r = Invoke-WebRequest -Uri $pingUrl -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -eq 200) -and ($r.Content -match "aar-dashboard")
  } catch {
    return $false
  }
}

function Open-DownloadPage {
  Start-Process "cmd.exe" -ArgumentList "/c", "start", "", $downloadUrl -WindowStyle Hidden
  Write-Host "Browser: $downloadUrl" -ForegroundColor Green
  Write-Host "Click the yellow button to save the zip." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "AAR - open download page" -ForegroundColor Cyan
Write-Host ""

if (Test-DashboardUp) {
  Write-Host "Dashboard already running." -ForegroundColor Green
  Open-DownloadPage
  exit 0
}

Write-Host "Starting dashboard (first time can take 10-25 min on an old PC)..." -ForegroundColor Yellow
Write-Host "Keep the black npm window open." -ForegroundColor Yellow
Write-Host ""

$starter = Join-Path $Root "scripts\start-dashboard.ps1"
if (-not (Test-Path $starter)) {
  Write-Host "ERROR: Not a full AAR folder (missing scripts\start-dashboard.ps1)." -ForegroundColor Red
  Write-Host "Extract the whole AAR-YA-PAAR.zip, then double-click this file again." -ForegroundColor Red
  exit 1
}

& $starter -Root $Root -Port $Port -OpenBrowserPath "/download"
exit $LASTEXITCODE
