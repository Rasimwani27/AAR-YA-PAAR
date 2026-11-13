# Summarize why the dashboard stopped (watchdog + node server logs).
param([string]$Root = "")

if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }
$dash = Join-Path $Root "dashboard"
$watch = Join-Path $dash "watchdog.log"
$server = Join-Path $dash "node-server.log"
$start = Join-Path $dash "dashboard-start.log"

Write-Host "=== AAR crash / stability logs ===" -ForegroundColor Cyan
Write-Host "Root: $Root`n"

Write-Host "[Memory now]" -ForegroundColor Yellow
Get-CimInstance Win32_OperatingSystem | ForEach-Object {
  $freeGb = [math]::Round($_.FreePhysicalMemory / 1MB, 2)
  $totalGb = [math]::Round($_.TotalVisibleMemorySize / 1MB, 2)
  Write-Host "  RAM free: ${freeGb} GB / ${totalGb} GB (if free is near 0 before crash, Chrome+Node+Python ran out of memory)"
}

Write-Host "`n[Port 43123]" -ForegroundColor Yellow
& (Join-Path $Root "scripts\doctor-dashboard.ps1") -Root $Root 2>$null | Select-String -Pattern "43123"

foreach ($pair in @(
    @("Watchdog log (restarts)", $watch),
    @("Node server log (last crash)", $server),
    @("Last START-HERE run", $start)
  )) {
  $label, $path = $pair
  Write-Host "`n[$label] $path" -ForegroundColor Yellow
  if (-not (Test-Path $path)) {
    Write-Host "  (file not created yet - use START-24-7-WATCHDOG.bat)" -ForegroundColor DarkGray
    continue
  }
  Get-Content $path -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
}

Write-Host "`n[Tips]" -ForegroundColor Green
Write-Host "  1. Use START-24-7-WATCHDOG.bat only (not START-HERE) for 24/7."
Write-Host "  2. Open pages with OPEN-LAB-BROWSER.bat - do not rely on auto-open Chrome."
Write-Host "  3. Close extra Chrome tabs; 4 GB RAM + Node + Python + Chrome often kills the browser."
Write-Host "  4. See docs/FIX-CRASHES-OLD-PC.md"
