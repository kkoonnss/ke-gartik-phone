@echo off
cd /d "%~dp0"

echo ============================================
echo  KE GartiK Phone - Push to GitHub
echo  Repo: https://github.com/kkoonnss/ke-gartik-phone
echo ============================================
echo.

:: Set git identity for this repo
git config user.email "kkoonnss@gmail.com"
git config user.name "Kons"

:: Init repo if missing
if not exist ".git" (
    git init -b main
)

:: Stage + commit (ignore errors if already committed)
git add -A
git commit -m "Initial commit: KE_GartiK_Phone v0.3" >nul 2>&1

:: Ensure main branch
git branch -M main >nul 2>&1

:: Remove any existing 'origin' (in case a previous run set a different one)
git remote remove origin >nul 2>&1

:: Add the remote
git remote add origin https://github.com/kkoonnss/ke-gartik-phone.git

echo.
echo ============================================
echo  Pushing now...
echo ============================================
echo.
echo If a browser window pops up asking you to sign in
echo to GitHub, that's Git Credential Manager — sign in
echo once and it remembers forever.
echo.

git push -u origin main
set PUSHRESULT=%ERRORLEVEL%

echo.
if %PUSHRESULT% EQU 0 (
    echo ============================================
    echo  SUCCESS - code is on GitHub
    echo ============================================
    echo.
    echo Reply "pushed" in the chat so Claude can finish
    echo the Render setup.
    echo.
) else (
    echo ============================================
    echo  PUSH FAILED
    echo ============================================
    echo.
    echo Most common causes:
    echo  1. You closed the GitHub sign-in popup. Re-run this script.
    echo  2. The repo on GitHub already has content. Delete it
    echo     at https://github.com/kkoonnss/ke-gartik-phone/settings
    echo     ^(scroll to bottom, Delete repository^) then recreate empty.
    echo  3. Git Credential Manager not installed. Install Git for
    echo     Windows from https://git-scm.com/download/win.
    echo.
)

pause
exit /b %PUSHRESULT%
