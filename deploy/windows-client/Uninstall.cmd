@echo off
setlocal
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1" -Action Uninstall
set "result=%errorlevel%"
echo.
pause
exit /b %result%
