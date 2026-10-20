@echo off
echo === Port check (ERR_CONNECTION_REFUSED = nothing listening) ===
echo.
powershell -NoProfile -Command ^
  "foreach ($p in 3000,43123) { Write-Host \"Port $p:\"; Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $n=(Get-Process -Id $_.OwningProcess -EA SilentlyContinue).ProcessName; Write-Host \"  LISTEN pid=$($_.OwningProcess) $n\" }; if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -EA SilentlyContinue)) { Write-Host \"  (nothing listening)\" }; try { $r=Invoke-WebRequest \"http://127.0.0.1:$p/api/ping\" -UseBasicParsing -TimeoutSec 2; $j=$r.Content | ConvertFrom-Json; if ($j.ok -eq $true -and $j.service -eq 'aar-dashboard') { Write-Host \"  ping OK — aar-dashboard\" -ForegroundColor Green } else { Write-Host \"  ping WRONG APP: $($r.Content)\" -ForegroundColor Yellow } } catch { Write-Host \"  ping FAIL (no /api/ping — wrong process or not ready)\" -ForegroundColor Red } ; Write-Host \"\" }"
echo.
pause
