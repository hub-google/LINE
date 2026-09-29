@echo off
setlocal
cd /d "%~dp0"

rem ========================================================
rem LINE Project Git Sync Launcher
rem Bypasses legacy cmd.exe UTF-8/Chinese encoding limitations
rem by delegating to deploy.ps1 with full Unicode support.
rem ========================================================

if not exist "%~dp0deploy.ps1" (
    echo [ERROR] deploy.ps1 was not found in "%~dp0".
    echo Please make sure deploy.ps1 and deploy.bat are in the same folder.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% neq 0 (
    echo.
    echo [INFO] Sync process ended with exit code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
