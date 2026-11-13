# Run from repo root after extracting AAR-UPDATE-MANUAL-TRADE.zip on top of your folder.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "START-HERE-43123.bat"))) {
    $root = Get-Location
}
if (-not (Test-Path (Join-Path $root "dashboard\package.json"))) {
    Write-Host "ERROR: Open this from your AAR folder (needs START-HERE-43123.bat and dashboard\)."
    exit 1
}
Write-Host "AAR patch applied in: $root"
Write-Host "Next: close old dashboard window, double-click START-HERE-43123.bat, open http://127.0.0.1:43123/"
Write-Host "Look for Build 2026.11.11-manual-trade on Trading desk."
