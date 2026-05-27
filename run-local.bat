@echo off
cd /d "%~dp0"

echo ----------------------------------------
echo  KE GartiK Phone - Local Launcher
echo ----------------------------------------
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

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo Node found: %NODE_VER%
echo.

:: Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo node_modules not found. Running npm install...
    echo.
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed. Check the output above.
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed OK.
    echo.
) else (
    echo Dependencies already installed.
    echo.
)

:: Open browser after 2 second delay in background
echo Opening http://localhost:3000 in your browser in 2 seconds...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

echo.
echo Starting server. Press Ctrl+C to stop.
echo ----------------------------------------
echo.

:: Start the server (blocking - stays open)
node server/index.js

echo.
echo Server stopped.
pause
