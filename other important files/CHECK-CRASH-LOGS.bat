@echo off
title AAR crash / watchdog logs
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\read-crash-logs.ps1" -Root "%CD%"
pause
