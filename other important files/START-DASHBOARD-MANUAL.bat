@echo off
title AAR dashboard manual (window stays open)
cd /d "%~dp0"
if not exist "%~dp0scripts\start-dashboard.ps1" (
  echo ERROR: Missing scripts\start-dashboard.ps1 — extract full AAR-YA-PAAR.zip to e.g. C:\AAR-YA-PAAR
  echo Read EXTRACT-ZIP-RIGHT.txt in the zip.
  pause
  exit /b 1
)
if not exist "%~dp0dashboard\package.json" (
  echo ERROR: Run this from the AAR-YA-PAAR folder ^(where START-HERE-43123.bat lives^).
  pause
  exit /b 1
)
call "%~dp0FIX-PORT-43123.bat"
if errorlevel 1 exit /b 1
cd /d "%~dp0dashboard"
set "AAR_REPO_ROOT=%~dp0"
set "AAR_REPO_ROOT=%AAR_REPO_ROOT:~0,-1%"
set AAR_PYTHON=py
set AAR_NO_REST=1
echo.
echo Building + starting on port 43123. First build can take 10-25 minutes on an old PC.
echo When you see Ready, open http://127.0.0.1:43123/api/ping
echo.
call npm run serve:alt
echo.
echo Server stopped.
pause
