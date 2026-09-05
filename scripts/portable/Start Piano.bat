@echo off
setlocal
title Piano Learning Portable
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Serve-Piano.ps1" -Root "%~dp0app"
if errorlevel 1 (
  echo.
  echo Piano Learning could not be started. See the message above.
  pause
)
endlocal
