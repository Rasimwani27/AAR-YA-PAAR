# Download AAR-YA-PAAR.zip and extract to a fresh folder under Documents.
param(
  [string]$Root = "",
  [int]$Port = 43123
)

$ErrorActionPreference = "Stop"
if (-not $Root) {
  $Root = Split-Path $PSScriptRoot -Parent
}

$zipName = "AAR-YA-PAAR.zip"
$stamp = Get-Date -Format "yyyy-MM-dd"
$parent = [Environment]::GetFolderPath("MyDocuments")
$newFolder = Join-Path $parent "AAR-YA-PAAR-$stamp"
$zipPath = Join-Path $env:TEMP $zipName
$pingUrl = "http://127.0.0.1:${Port}/api/ping"
$downloadUrl = "http://127.0.0.1:${Port}/api/download-zip?confirm=1"

function Ensure-Server {
  try {
    $r = Invoke-WebRequest -Uri $pingUrl -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200 -and $r.Content -match "aar-dashboard") { return $true }
  } catch { }
  Write-Host "Dashboard not running - starting it (wait, keep npm window open)..." -ForegroundColor Yellow
  $click = Join-Path $Root "scripts\click-open-download.ps1"
  if (-not (Test-Path (Join-Path $Root "scripts\start-dashboard.ps1"))) {
    throw "Not a full AAR folder. You need an old copy or git pull once, then run DOWNLOAD-NEW-FOLDER.bat again."
  }
  $starter = Join-Path $Root "scripts\start-dashboard.ps1"
  & $starter -Root $Root -Port $Port -OpenBrowserPath "/"
  for ($i = 0; $i -lt 1800; $i++) {
    Start-Sleep -Seconds 1
    try {
      $r = Invoke-WebRequest -Uri $pingUrl -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200 -and $r.Content -match "aar-dashboard") { return $true }
    } catch { }
    if ($i -gt 0 -and $i % 60 -eq 0) {
      Write-Host "  still waiting for server... ${i}s" -ForegroundColor DarkYellow
    }
  }
  throw "Server did not start. Read the npm window for errors."
}

Write-Host ""
Write-Host "=== AAR: download into NEW folder ===" -ForegroundColor Cyan
Write-Host "Target: $newFolder"
Write-Host ""

$localZip = Join-Path $Root $zipName
if ((Test-Path $localZip) -and (Get-Item $localZip).Length -gt 500000) {
  Write-Host "Using zip already in this folder: $localZip" -ForegroundColor Green
  $zipPath = $localZip
} else {
  $null = Ensure-Server
  Write-Host "Downloading $zipName ..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
  $len = (Get-Item $zipPath).Length
  if ($len -lt 500000) {
    throw "Download too small ($len bytes). Try again or use http://127.0.0.1:${Port}/download"
  }
}

if (Test-Path $newFolder) {
  Write-Host "Removing old $newFolder" -ForegroundColor DarkYellow
  Remove-Item -LiteralPath $newFolder -Recurse -Force
}
New-Item -ItemType Directory -Path $newFolder -Force | Out-Null

Write-Host "Extracting (1-3 minutes)..." -ForegroundColor Cyan
Expand-Archive -LiteralPath $zipPath -DestinationPath $newFolder -Force

$bat = Join-Path $newFolder "START-HERE-43123.bat"
if (-not (Test-Path $bat)) {
  throw "Zip looks wrong (no START-HERE-43123.bat in $newFolder)"
}

Write-Host ""
Write-Host "DONE." -ForegroundColor Green
Write-Host "New folder: $newFolder" -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Open that folder in Explorer (opening now)" -ForegroundColor White
Write-Host "  2. Double-click START-HERE-43123.bat" -ForegroundColor White
Write-Host "  3. Browser: http://127.0.0.1:43123/" -ForegroundColor White
Write-Host ""

Start-Process "explorer.exe" -ArgumentList $newFolder
Start-Process "cmd.exe" -ArgumentList "/c", "start", "", "http://127.0.0.1:${Port}/download" -WindowStyle Hidden
