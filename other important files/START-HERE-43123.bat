@echo off
title AAR-YA-PAAR start dashboard (port 43123)
rem Want download only? Double-click CLICK-ME-GET-UPDATES.bat instead.
cd /d "%~dp0"
echo.
echo Folder: %CD%
if not exist "%~dp0scripts\start-dashboard.ps1" (
  echo.
  echo ERROR: Missing scripts\start-dashboard.ps1
  echo You are NOT in a full AAR-YA-PAAR folder ^(only one bat in Downloads will not work^).
  echo.
  echo Fix:
  echo   1. Extract the whole AAR-YA-PAAR.zip to e.g. C:\AAR-YA-PAAR
  echo   2. Open that folder - you must see folders: aar, dashboard, scripts, tools
  echo   3. Run START-HERE-43123.bat from INSIDE that folder
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0dashboard\package.json" (
  echo ERROR: Missing dashboard\package.json - extract the full zip, not dashboard alone.
  pause
  exit /b 1
)
echo Requires Node.js 20 LTS from https://nodejs.org/
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dashboard.ps1" -Root "%CD%" -Port 43123 2>&1
if %ERRORLEVEL% NEQ 0 goto :maybe_ps1_broken
goto :after_ps1

:maybe_ps1_broken
echo.
echo If you see ParserError / missing terminator, use START-DASHBOARD-MANUAL.bat instead.
echo Or copy scripts\start-dashboard.ps1 from the latest AAR-YA-PAAR.zip again.
goto :after_ps1

:after_ps1
set ERR=%ERRORLEVEL%
echo.
if %ERR% NEQ 0 (
  echo FAILED ^(exit %ERR%^). Read the red lines above.
  echo Try: FIX-PORT-43123.bat  or  scripts\doctor-dashboard.ps1
  echo If you see "Unexpected token", read FIX-UNEXPECTED-TOKEN.txt
) else (
  echo OK: A second black window should be open running npm - keep THAT window open.
  echo Then open: http://127.0.0.1:43123/api/ping
  echo This window can close after you read the message; do NOT close the npm window.
)
echo.
pause
