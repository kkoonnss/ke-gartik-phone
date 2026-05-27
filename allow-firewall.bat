@echo off
cd /d "%~dp0"

:: This script needs to run as Administrator. We self-elevate.
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ----------------------------------------
echo  KE GartiK Phone - Firewall Allow Rule
echo ----------------------------------------
echo.
echo This adds a one-time Windows Firewall rule
echo so phones on your WiFi can reach the game.
echo.

netsh advfirewall firewall add rule ^
    name="KE GartiK Phone (TCP 3000)" ^
    dir=in action=allow protocol=TCP localport=3000

if errorlevel 1 (
    echo.
    echo ERROR: Firewall rule could not be added.
    echo You can add one manually: Windows Settings ^> Update ^& Security ^>
    echo Windows Security ^> Firewall ^& network protection ^> Allow an app
    echo through firewall ^> add Node.js.
) else (
    echo.
    echo Firewall rule added. Phones on the same WiFi can now
    echo reach http://YOUR_LAN_IP:3000 while the server is running.
)

echo.
pause
