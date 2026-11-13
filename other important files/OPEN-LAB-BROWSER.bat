@echo off
title Open AAR lab in browser (does not start server)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-lab-browser.ps1" -Port 43123
echo Browser opened. Server must already run via START-24-7-WATCHDOG.bat
timeout /t 3 >nul
