@echo off
title AAR - Click for download page
cd /d "%~dp0"
echo.
echo   Double-click workflow: start lab if needed, open browser download page.
echo   Folder: %CD%
echo.
if not exist "%~dp0scripts\click-open-download.ps1" (
  echo ERROR: Extract the FULL AAR-YA-PAAR zip first ^(need scripts\ folder^).
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\click-open-download.ps1" -Root "%CD%" -Port 43123
echo.
pause
