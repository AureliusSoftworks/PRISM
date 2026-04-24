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

REM -- Preflight: kill any orphaned dev procs from a prior crashed/closed run -
REM Without this, a stale `node --watch` holds the SQLite WAL + API port,
REM causing `npm run dev` to crash with "database is locked" on the API side
REM while Turbopack still prints "Ready in 0ms" from its warm cache on the web
REM side -- the classic false-success "ready in 0ms" bug.
echo Cleaning up any leftover dev processes...
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr ":8788 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr ":3003 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Prism API (dev)" /T >nul 2>&1

REM -- API in its own window, watch + dev DB ----------------------------------
REM `--env-file-if-exists=.env` silently no-ops when .env is absent (Node 22+).
REM Without it, OPENAI_API_KEY / OLLAMA_HOST / etc. from .env never reach the
REM API and every OpenAI chat turn 401s with a cryptic "invalid key".
start "Prism API (dev)" cmd /k ^
  "cd /d ""%~dp0"" && set DB_PATH=%CD%\apps\api\data\localai-dev.db&& set API_PORT=8788&& set NEXT_TELEMETRY_DISABLED=1&& node --env-file-if-exists=.env --watch --experimental-strip-types apps\api\src\server.ts"

REM -- Web dev server in this window ------------------------------------------
cd apps\web
set "LOCALAI_API_ORIGIN=http://127.0.0.1:8788"
set "NEXT_TELEMETRY_DISABLED=1"
set "HOSTNAME=0.0.0.0"
set "PORT=3003"
call npx next dev -H 0.0.0.0 -p 3003

REM -- Teardown: when the web window exits, take the paired API window with it
REM `cmd /k` keeps the API window alive even after its node process dies, so
REM without this the API window would linger and its child could respawn --
REM exactly how the "ready in 0ms" zombies accumulated before.
echo.
echo Web dev server stopped. Closing API window...
taskkill /F /FI "WINDOWTITLE eq Prism API (dev)" /T >nul 2>&1
