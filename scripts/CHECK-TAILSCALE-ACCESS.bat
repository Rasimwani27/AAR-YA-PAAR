@echo off
title Check dashboard + Tailscale access
echo.
echo [1] Is anything listening on port 43123?
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 43123 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('  LISTENING on ' + $_.LocalAddress + ':43123 pid=' + $_.OwningProcess) -ForegroundColor Green }; if (-not (Get-NetTCPConnection -LocalPort 43123 -State Listen -EA SilentlyContinue)) { Write-Host '  NOTHING on 43123 - run START-HERE-43123.bat first' -ForegroundColor Red }"
echo.
echo [2] Local ping (must work before Tailscale)
powershell -NoProfile -Command "try { $r=Invoke-WebRequest 'http://127.0.0.1:43123/api/ping' -UseBasicParsing -TimeoutSec 3; Write-Host ('  OK ' + $r.Content) -ForegroundColor Green } catch { Write-Host ('  FAIL ' + $_.Exception.Message) -ForegroundColor Red }"
echo.
echo [3] Tailscale IP on THIS pc (use this on your phone browser)
where tailscale >nul 2>&1
if errorlevel 1 (
  echo   tailscale CLI not in PATH - open Tailscale tray icon and copy 100.x address
) else (
  tailscale ip -4
)
echo.
echo [4] Ping via Tailscale IP on this PC (optional)
powershell -NoProfile -Command "if (Get-Command tailscale -EA SilentlyContinue) { $ip=(tailscale ip -4 2>$null | Select-Object -First 1); if ($ip) { try { $r=Invoke-WebRequest (\"http://$ip:43123/api/ping\") -UseBasicParsing -TimeoutSec 5; Write-Host ('  OK via ' + $ip + ' ' + $r.Content) -ForegroundColor Green } catch { Write-Host ('  FAIL via ' + $ip + ' - run scripts\\open-firewall-43123.ps1 as Admin') -ForegroundColor Yellow } } }"
echo.
echo Phone URL: http://100.x.y.z:43123  ^(100.x = step 3, NOT your phone IP^)
echo Must use http NOT https
pause
