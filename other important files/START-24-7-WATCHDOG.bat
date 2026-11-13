@echo off
title AAR 24/7 - dashboard watchdog (port 43123)
cd /d "%~dp0"
echo Keeps the lab running. Restarts Node if it crashes OR stops answering /api/ping.
echo Minimize this window - do NOT close it.
echo Open Chrome separately: OPEN-LAB-BROWSER.bat  (survives server restarts)
echo Logs: dashboard\watchdog.log + CHECK-CRASH-LOGS.bat if Chrome also died
echo See docs\FIX-CRASHES-OLD-PC.md on 4GB RAM PCs
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dashboard-watchdog.ps1" -Root "%CD%" -Port 43123
