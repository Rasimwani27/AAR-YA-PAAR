@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0\.."
set "AAR_REPO_ROOT=%CD%"
cd /d "%~dp0"

set "AAR_NO_REST=1"
set "NEXT_DISABLE_TURBOPACK=1"
set "AAR_DISABLE_EXEC="
set "NODE_OPTIONS=--max-old-space-size=4096"
where py >nul 2>&1 && set "AAR_PYTHON=py" || set "AAR_PYTHON=python"

echo === AAR dashboard (port 43123) ===
echo Repo: %AAR_REPO_ROOT%

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :43123 ^| findstr LISTENING') do (
  echo Killing stale process on port 43123 PID %%a
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

if not exist node_modules (
  echo npm install...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "%AAR_REPO_ROOT%\aar\__main__.py" (
  echo ERROR: Missing %AAR_REPO_ROOT%\aar
  echo Use full AAR-YA-PAAR repo.
  pause
  exit /b 1
)

echo.
echo Building dashboard (one-time, ~30s) then starting production server...
echo Open http://127.0.0.1:43123/ when you see "Ready"
echo.

call npm run serve:alt
pause
endlocal
