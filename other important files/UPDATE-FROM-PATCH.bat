@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\APPLY-UPDATE-ZIP.ps1"
pause
