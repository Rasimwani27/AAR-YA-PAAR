@echo off
title AAR clean rebuild dashboard (43123)
cd /d "%~dp0dashboard"
echo Deleting old build...
if exist .next rmdir /s /q .next
echo npm install...
call npm install
if errorlevel 1 pause & exit /b 1
echo npm run build - wait until finished (no red errors)...
call npm run build
if errorlevel 1 (
  echo.
  echo BUILD FAILED - copy the red error text above and share it.
  pause
  exit /b 1
)
echo.
echo Build OK. Now run START-HERE-43123.bat from the parent folder.
pause
