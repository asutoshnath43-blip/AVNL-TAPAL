@echo off
title AVNL Tapal Manager

:: ─── Go to the folder where this .bat file lives ────────────────────────────
cd /d "%~dp0"

:: ─── Check Node is installed ─────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Download it from: https://nodejs.org
    pause
    exit /b 1
)

:: ─── Check npm is installed ──────────────────────────────────────────────────
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not found. Please reinstall Node.js.
    pause
    exit /b 1
)

:: ─── Check node_modules exists, install if missing ───────────────────────────
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Running npm install...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
)

:: ─── Open browser after 3 seconds (gives server time to start) ───────────────
echo [INFO] Starting server...
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: ─── Start the server (keeps this window open as the server log) ─────────────
echo ============================================================
echo   AVNL Tapal Manager
echo   Server: http://localhost:3000
echo   Press Ctrl+C to stop the server.
echo ============================================================
echo.
npm start
