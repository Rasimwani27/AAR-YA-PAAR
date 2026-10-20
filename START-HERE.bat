@echo off
title AAR-YA-PAAR — start dashboard
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dashboard.ps1" -Root "%CD%"
if errorlevel 1 pause
