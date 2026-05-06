@echo off
:: ═══════════════════════════════════════════════════════════
::  ElitePhysio — Deploy to GitHub & Netlify
::  Double-click this file to publish your latest changes
:: ═══════════════════════════════════════════════════════════

echo.
echo  ╔══════════════════════════════════╗
echo  ║  ElitePhysio — Deploying...      ║
echo  ╚══════════════════════════════════╝
echo.

:: Go to the folder where this script lives
cd /d "%~dp0"

:: Check git is available
where git >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Git not found. Please install Git from https://git-scm.com
  pause
  exit /b
)

:: Stage all changed files
echo  [1/3] Saving your changes...
git add .

:: Commit with today's date and time
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set TODAY=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set NOW=%%a:%%b
git commit -m "Update %TODAY% %NOW%"

:: Push to GitHub (Netlify auto-deploys from here)
echo  [2/3] Uploading to GitHub...
git push origin main

echo.
echo  [3/3] Done! Netlify is now building your site.
echo.
echo  Your site will be live in about 30 seconds at your Netlify URL.
echo.
pause
