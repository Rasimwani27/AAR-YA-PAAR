@echo off
title AAR - Download into NEW folder (Documents)
cd /d "%~dp0"
echo.
echo   Saves a fresh copy to Documents\AAR-YA-PAAR-YYYY-MM-DD
echo   You need ANY old AAR folder for this to start the download server once.
echo.
if not exist "%~dp0scripts\download-to-new-folder.ps1" (
  echo This file is from the latest zip. Use git pull or copy this .bat from Cursor.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\download-to-new-folder.ps1" -Root "%CD%" -Port 43123
echo.
pause
