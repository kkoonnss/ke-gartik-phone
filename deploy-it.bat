@echo off
cd /d "%~dp0"

echo ============================================
echo  KE GartiK Phone - One-Click Git Push
echo ============================================
echo.

:: Check git
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed. Download from https://git-scm.com/download/win
    pause
    exit /b 1
)

:: Set git identity for this repo (uses Kons's email)
echo Setting git identity for this repo...
git config user.email "kkoonnss@gmail.com"
git config user.name "Kons"
echo.

:: Initialize repo if needed
if not exist ".git" (
    echo Initializing git repo...
    git init -b main
    if errorlevel 1 goto :err
)

:: Stage and commit
echo Staging files...
git add -A
echo.
echo Committing...
git commit -m "Initial commit: KE_GartiK_Phone v0.3" 2>nul
if errorlevel 1 (
    echo Nothing new to commit, continuing...
)
echo.

:: Ensure main branch
git branch -M main 2>nul

:: Check if remote exists
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo ============================================
    echo  GitHub remote not yet set
    echo ============================================
    echo.
    echo Paste the GitHub URL Claude gave you and press Enter.
    echo Example: https://github.com/yourname/ke-gartik-phone.git
    echo.
    set /p GITURL="GitHub URL: "
    if "%GITURL%"=="" (
        echo No URL entered. Run this script again when you have one.
        pause
        exit /b 1
    )
    git remote add origin %GITURL%
    if errorlevel 1 goto :err
)

echo.
echo ============================================
echo  Pushing to GitHub
echo ============================================
echo.
echo If a browser window opens asking you to sign in to GitHub, that's
echo normal — sign in once and it will remember. Then this script
echo continues automatically.
echo.

git push -u origin main
if errorlevel 1 (
    echo.
    echo ERROR: Push failed. Common causes:
    echo  - The GitHub repo URL is wrong (re-check it on github.com)
    echo  - You cancelled the sign-in popup
    echo  - The repo already has content (delete and re-create empty)
    pause
    exit /b 1
)

echo.
echo ============================================
echo  DONE
echo ============================================
echo Code pushed to GitHub. Claude is now setting up Render.
echo Check back in the chat window for your live URL.
echo.
pause
exit /b 0

:err
echo ERROR running git command.
pause
exit /b 1
