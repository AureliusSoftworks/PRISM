@echo off
title LocalAI ChatGov - Starting...
cd /d "%~dp0"

echo ============================================
echo   LocalAI ChatGov - One-Click Launcher
echo ============================================
echo.

REM ── Check for Node.js ──
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [1/5] Node.js not found. Installing Node 22 LTS via Chocolatey...
    choco install nodejs-lts --version=22.15.0 -y
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install Node.js. Please install manually from https://nodejs.org
        pause
        exit /b 1
    )
    echo Node.js installed. Refreshing environment...
    call refreshenv
) else (
    echo [1/5] Node.js found.
)

REM ── Create .env if missing ──
if not exist ".env" (
    echo [2/5] Creating .env from .env.example...
    copy .env.example .env >nul
    echo IMPORTANT: Edit .env with your secrets before first use.
    echo            Opening .env now...
    notepad .env
    echo Press any key after you have saved .env...
    pause >nul
) else (
    echo [2/5] .env already exists.
)

REM ── Install dependencies ──
echo [3/5] Installing dependencies (first run may take a minute)...
cd packages\shared
call npm install --prefer-offline 2>nul
call npm run build
cd ..\config
call npm install --prefer-offline 2>nul
call npm run build
cd ..\..\apps\api
call npm install --prefer-offline 2>nul
cd ..\web
call npm install --prefer-offline 2>nul
cd ..\..

echo [4/5] Dependencies ready.

REM ── Update .env for local (non-Docker) usage ──
REM Ensure Ollama points to localhost not host.docker.internal
>nul findstr /C:"host.docker.internal" .env && (
    echo Patching .env for native usage...
    powershell -Command "(Get-Content .env) -replace 'host.docker.internal','localhost' | Set-Content .env"
)
>nul findstr /C:"NEXT_PUBLIC_API_BASE_URL=http://192.168.0.202:8787" .env && (
    echo Patching frontend API base back to /api for same-origin auth...
    powershell -Command "(Get-Content .env) -replace 'NEXT_PUBLIC_API_BASE_URL=http://192.168.0.202:8787','NEXT_PUBLIC_API_BASE_URL=/api' | Set-Content .env"
)

REM ── Create data directory ──
if not exist "apps\api\data" mkdir apps\api\data

echo [5/5] Starting servers...
echo.
echo ============================================
echo   API:  http://192.168.0.202:8787
echo   Web:  http://192.168.0.202:3000
echo   Open from any device on your network!
echo ============================================
echo.
echo Press Ctrl+C to stop both servers.
echo.

REM ── Start API in background, web in foreground ──
echo Starting API console...
start "LocalAI API" cmd /k "cd /d ""%~dp0"" && node --experimental-strip-types apps\api\src\server.ts"
cd apps\web
echo Building frontend for production...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Frontend build failed.
    pause
    exit /b 1
)
echo Starting frontend in production mode...
call npx next start -H 0.0.0.0 -p 3000
