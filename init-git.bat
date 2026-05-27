@echo off
cd /d "%~dp0"

echo ----------------------------------------
echo  KE GartiK Phone - Git Init
echo ----------------------------------------
echo.

:: Check git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: git is not installed or not in PATH.
    echo Download from https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

:: Initialize repo if not already
if not exist ".git" (
    echo Initializing git repository...
    git init -b main
    if errorlevel 1 goto :err
) else (
    echo Repository already initialized.
)

echo.
echo Staging all files...
git add -A
if errorlevel 1 goto :err

echo.
echo Committing...
git commit -m "Initial commit: KE_GartiK_Phone MVP from parallel build sprint"
if errorlevel 1 (
    echo Nothing to commit, working tree clean.
)

echo.
echo ----------------------------------------
echo  NEXT STEPS
echo ----------------------------------------
echo.
echo 1. Create a new empty repo on GitHub:
echo    https://github.com/new
echo    Name it something like ke-gartik-phone, leave it empty.
echo.
echo 2. Copy the URL GitHub gives you and run, in this folder:
echo      git remote add origin YOUR_GITHUB_URL
echo      git push -u origin main
echo.
echo 3. Then go to https://render.com, click New ^> Blueprint,
echo    select the repo. Render reads render.yaml automatically.
echo.
echo 4. Wait about 3 minutes. Your live URL appears at the top
echo    of the service dashboard.
echo.
pause
exit /b 0

:err
echo.
echo ERROR running git command. See output above.
pause
exit /b 1
