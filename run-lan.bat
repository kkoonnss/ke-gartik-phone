@echo off
cd /d "%~dp0"

echo ----------------------------------------
echo  KE GartiK Phone - LAN Launcher
echo ----------------------------------------
echo.
echo This runs the server so other devices on
echo your WiFi (phones) can join it.
echo.

:: Check Node is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Download it from https://nodejs.org  ^(version 20 or newer^)
    echo.
    pause
    exit /b 1
)

:: Install deps if missing
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
    echo.
)

:: Detect LAN IPv4 (skip 169.* link-local, skip 127.*)
set "LAN_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4 Address"') do (
    set "TMP=%%a"
    setlocal enabledelayedexpansion
    set "TMP=!TMP: =!"
    echo !TMP! | findstr /B /R "169\." >nul && (endlocal & goto :nextip)
    echo !TMP! | findstr /B /R "127\." >nul && (endlocal & goto :nextip)
    endlocal & set "LAN_IP=%%a"
    set "LAN_IP=!LAN_IP: =!"
    goto :gotip
    :nextip
)
:gotip

if "%LAN_IP%"=="" (
    echo Could not auto-detect a LAN IP. Run "ipconfig" in cmd
    echo and look for an "IPv4 Address" starting with 192.168 or 10.
    echo Your phone needs to type http://THAT_IP:3000 into its browser.
    echo.
) else (
    echo Your PC LAN IP appears to be: %LAN_IP%
    echo.
    echo On your phone, open a browser and go to:
    echo.
    echo     http://%LAN_IP%:3000
    echo.
    echo Phone MUST be on the same WiFi as this PC.
    echo If it does not connect, run allow-firewall.bat ONCE as admin.
    echo.
)

:: Open the LAN URL in default browser too (handy for testing on the same PC)
if not "%LAN_IP%"=="" (
    start "" cmd /c "timeout /t 3 /nobreak >nul && start http://%LAN_IP%:3000"
)

echo Starting server. Press Ctrl+C to stop.
echo ----------------------------------------
echo.

node server/index.js

echo.
echo Server stopped.
pause
