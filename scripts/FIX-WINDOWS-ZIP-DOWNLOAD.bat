@echo off
title Fix AAR download (no .zip extension)
echo.
echo Windows sometimes saves the project as a plain "File" without .zip
echo (e.g. AAR-YA-PAAR-download 7 in Downloads). This script fixes that.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0FIX-WINDOWS-ZIP-DOWNLOAD.ps1"
echo.
pause
