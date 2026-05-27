@echo off
cd /d "%~dp0"

echo ----------------------------------------
echo  KE GartiK Phone - Deploy Pre-flight
echo ----------------------------------------
echo.

set ERRORS=0

:: --- File checks ---
echo [1/4] Checking required files...

if not exist "server\index.js" (
    echo   MISSING: server\index.js
    set ERRORS=1
) else (
    echo   OK: server\index.js
)

if not exist "public\index.html" (
    echo   MISSING: public\index.html
    set ERRORS=1
) else (
    echo   OK: public\index.html
)

if not exist "render.yaml" (
    echo   MISSING: render.yaml
    set ERRORS=1
) else (
    echo   OK: render.yaml
)

if not exist "package.json" (
    echo   MISSING: package.json
    set ERRORS=1
) else (
    echo   OK: package.json
)

if not exist "Procfile" (
    echo   MISSING: Procfile
    set ERRORS=1
) else (
    echo   OK: Procfile
)

echo.

if "%ERRORS%"=="1" (
    echo ERROR: One or more required files are missing. Build may be incomplete.
    echo        Other agents may still be working. Re-run this script when done.
    echo.
    pause
    exit /b 1
)

:: --- npm install ---
echo [2/4] Running npm install...
echo.
npm install
if errorlevel 1 (
    echo ERROR: npm install failed. Check the output above.
    pause
    exit /b 1
)
echo.
echo npm install OK.
echo.

:: --- Start server + hit /health ---
echo [3/4] Starting server briefly to verify /health endpoint...
echo.

:: Start server in background and capture PID
start "" /b node server\index.js >nul 2>&1

:: Give the server 3 seconds to boot
timeout /t 3 /nobreak >nul

:: Hit the health endpoint
echo Hitting http://localhost:3000/health ...
curl -s -o nul -w "HTTP status: %%{http_code}" http://localhost:3000/health
if errorlevel 1 (
    echo.
    echo WARNING: curl not found or health check failed.
    echo          If curl is not installed, verify manually by visiting http://localhost:3000/health
    echo          after running run-local.bat.
) else (
    echo.
)

echo.

:: Kill the server process (find node processes started by this check)
taskkill /f /im node.exe >nul 2>&1
echo Server stopped.
echo.

:: --- Next steps ---
echo [4/4] Pre-flight complete. Next steps:
echo.
echo   1. Make sure this folder is a git repository:
echo         git init
echo         git add .
echo         git commit -m "Initial commit"
echo.
echo   2. Create a GitHub repository at https://github.com/new
echo      Then push:
echo         git remote add origin https://github.com/YOUR-USER/ke-gartik-phone.git
echo         git branch -M main
echo         git push -u origin main
echo.
echo   3. Go to https://render.com and sign in (free account).
echo.
echo   4. Click New ^> Blueprint ^> connect your GitHub repo.
echo      Render reads render.yaml automatically. Click Apply.
echo.
echo   5. Wait ~3 minutes for the first build. Your URL appears at the top
echo      of the Render service dashboard.
echo.
echo   6. Before game night: visit the URL 1 minute early to wake up the
echo      server (free tier sleeps after 15 min of no traffic).
echo.

:: Offer to open render.com
set /p OPEN_RENDER="Open render.com/select-repo in your browser now? (y/n): "
if /i "%OPEN_RENDER%"=="y" (
    start https://render.com/select-repo
)

echo.
echo Done. Good luck on game night.
echo ----------------------------------------
pause
