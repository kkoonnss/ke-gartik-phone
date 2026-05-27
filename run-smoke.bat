@echo off
cd /d "%~dp0"

echo ----------------------------------------
echo  KE GartiK Phone - Smoke Test
echo ----------------------------------------
echo.
echo This runs the automated mode-by-mode tester.
echo The server must already be running (use run-local.bat in another window).
echo.

:: Check Node is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

:: Install devDependencies if not present
if not exist "node_modules\socket.io-client" (
    echo Installing test dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
    echo.
)

echo Running smoke test against http://localhost:3000 ...
echo.
node tests/smoke.js
set EXITCODE=%ERRORLEVEL%

echo.
echo ----------------------------------------
if %EXITCODE% EQU 0 (
    echo  ALL MODES PASSED
) else (
    echo  SOME MODES FAILED, see output above
)
echo ----------------------------------------
pause
exit /b %EXITCODE%
