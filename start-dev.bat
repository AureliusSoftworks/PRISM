@echo off
title Prism (dev)
cd /d "%~dp0"

echo ============================================
echo   Prism - Dev Launcher
echo   Web:  http://localhost:3003
echo   API:  http://localhost:8788
echo   DB:   apps\api\data\localai-dev.db
echo ============================================
echo.

REM Dev sessions run alongside start.bat (prod on :3000/:8787). Separate DB
REM keeps prod data untouched. Watch mode picks up code changes without a
REM manual restart.

REM -- [1/5] Node.js -----------------------------------------------------------
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

REM -- [2/5] .env -------------------------------------------------------------
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

REM -- [3/5] dependencies -----------------------------------------------------
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

REM -- patch .env for native dev usage ----------------------------------------
REM Ensure Ollama points to localhost not host.docker.internal
>nul findstr /C:"host.docker.internal" .env && (
    echo Patching .env for native usage...
    powershell -Command "(Get-Content .env) -replace 'host.docker.internal','localhost' | Set-Content .env"
)

if not exist "apps\api\data" mkdir apps\api\data

echo [5/5] Starting watch-mode dev servers...
echo.
echo Press Ctrl+C in either window to stop.
echo.

REM -- API in its own window, watch + dev DB ----------------------------------
start "Prism API (dev)" cmd /k ^
  "cd /d ""%~dp0"" && set DB_PATH=%CD%\apps\api\data\localai-dev.db&& set API_PORT=8788&& set NEXT_TELEMETRY_DISABLED=1&& node --watch --experimental-strip-types apps\api\src\server.ts"

REM -- Web dev server in this window ------------------------------------------
cd apps\web
set "LOCALAI_API_ORIGIN=http://127.0.0.1:8788"
set "NEXT_TELEMETRY_DISABLED=1"
set "HOSTNAME=0.0.0.0"
set "PORT=3003"
call npx next dev -H 0.0.0.0 -p 3003
