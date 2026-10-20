@echo off
title AAR-YA-PAAR — start dashboard (port 43123)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dashboard.ps1" -Root "%CD%" -Port 43123
if errorlevel 1 pause
