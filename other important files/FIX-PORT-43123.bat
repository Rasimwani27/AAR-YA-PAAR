@echo off
title Fix port 43123 (Cursor vs AAR dashboard)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\assert-dashboard-port.ps1" -Port 43123 -KillNodeFirst
if errorlevel 1 (
  echo.
  type "%~dp0FIX-PORT-43123-CURSOR.txt"
  pause
  exit /b 1
)
echo Port 43123 is clear for node.exe — run START-HERE-43123.bat
pause
