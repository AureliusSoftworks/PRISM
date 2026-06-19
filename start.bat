@echo off
setlocal EnableExtensions
title Prism - Starting...
cd /d "%~dp0"

REM Prism launcher cleanup: stale dev/prod sessions can leave the API or web
REM port open and make the next launch fail immediately with EADDRINUSE.
call :cleanupPorts

set "PRISM_MODE=%~1"
if /I "%PRISM_MODE%"=="dev" goto modeReady
if /I "%PRISM_MODE%"=="prod" goto modeReady
if /I "%PRISM_MODE%"=="production" (
    set "PRISM_MODE=prod"
    goto modeReady
)

REM Default to production only on release/mainline. Feature branches should use
REM the dev DB so a plain double-click keeps opening the working local instance.
for /f "usebackq delims=" %%B in (`git branch --show-current 2^>nul`) do set "CURRENT_BRANCH=%%B"
if /I "%CURRENT_BRANCH%"=="main" (
    set "PRISM_MODE=prod"
) else (
    set "PRISM_MODE=dev"
)

:modeReady
if /I "%PRISM_MODE%"=="dev" goto devMode
if /I "%PRISM_MODE%"=="prod" goto prodMode

echo Usage: start.bat [dev^|prod]
pause
exit /b 1

:prodMode
title Prism - Production
echo ============================================
echo   Prism - One-Click Launcher
echo   Mode: production
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
>nul findstr /C:"API_PORT=8787" .env && (
    echo Migrating Prism API port to 18787...
    powershell -Command "(Get-Content .env) -replace 'API_PORT=8787','API_PORT=18787' | Set-Content .env"
)
>nul findstr /C:"WEB_PORT=" .env || (
    echo Adding Prism web port 18788...
    echo WEB_PORT=18788>> .env
)
>nul findstr /C:"WEB_PORT=3000" .env && (
    echo Migrating Prism web port to 18788...
    powershell -Command "(Get-Content .env) -replace 'WEB_PORT=3000','WEB_PORT=18788' | Set-Content .env"
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
echo   API:  http://192.168.0.202:18787
echo   Web:  http://192.168.0.202:18788
echo   Open from any device on your network!
echo ============================================
echo.
echo Press Ctrl+C to stop both servers.
echo.

REM ── Start API in background, web in foreground ──
REM `--env-file-if-exists` silently no-ops when .env is missing (Node 22+).
REM Without it, OPENAI_API_KEY / OLLAMA_HOST / etc. from .env never reach the
REM API process and every OpenAI chat turn 401s with a cryptic "invalid key".
echo Starting API console...
start "Prism API" cmd /k "cd /d ""%~dp0"" && node --env-file-if-exists=.env --experimental-strip-types apps\api\src\server.ts"
cd apps\web
echo Building frontend for production...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Frontend build failed.
    pause
    exit /b 1
)
echo Starting frontend in production mode...
if not exist ".next\standalone\apps\web\server.js" (
    echo ERROR: Standalone frontend server was not generated.
    pause
    exit /b 1
)

REM Next.js "output: standalone" does not copy static assets or the public
REM folder into the standalone bundle. Without these, the browser loads the
REM HTML document but every JS/CSS/font request 404s, leaving a blank page.
echo Staging static assets into standalone bundle...
if exist ".next\static" (
    xcopy /E /Y /I /Q ".next\static" ".next\standalone\apps\web\.next\static" >nul
)
if exist "public" (
    xcopy /E /Y /I /Q "public" ".next\standalone\apps\web\public" >nul
)

set "HOSTNAME=0.0.0.0"
set "PORT=18788"
call node .next\standalone\apps\web\server.js
goto end

:devMode
title Prism (dev)
echo ============================================
echo   Prism - Dev Launcher
echo   Web:  http://localhost:18790
echo   API:  http://localhost:18789
echo   DB:   apps\api\data\localai-dev.db
echo ============================================
echo.

REM Dev sessions run alongside prod mode (prod on :18788/:18787). Separate DB
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

REM -- Load root .env into this cmd session so every child inherits it. -------
REM The API already picks up .env via `node --env-file-if-exists=.env`, but
REM `next dev` runs from apps\web and Next.js only reads .env files from its
REM own working directory -- it never sees the repo-root .env. Sourcing here
REM is how NEXT_PUBLIC_* vars defined once at the repo root actually reach the
REM web dev server.
if exist ".env" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
        if not "%%A"=="" set "%%A=%%B"
    )
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
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr ":18789 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr ":18790 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Prism API (dev)" /T >nul 2>&1

REM -- API in its own window, watch + dev DB ----------------------------------
REM `--env-file-if-exists=.env` silently no-ops when .env is absent (Node 22+).
REM Without it, OPENAI_API_KEY / OLLAMA_HOST / etc. from .env never reach the
REM API and every OpenAI chat turn 401s with a cryptic "invalid key".
start "Prism API (dev)" cmd /k call "%~dp0scripts\windows-dev-api.cmd"

REM -- Web dev server in this window ------------------------------------------
cd apps\web
set "LOCALAI_API_ORIGIN=http://127.0.0.1:18789"
set "NEXT_TELEMETRY_DISABLED=1"
set "HOSTNAME=0.0.0.0"
set "PORT=18790"
call npx next dev -H 0.0.0.0 -p 18790

REM -- Teardown: when the web window exits, take the paired API window with it
echo.
echo Web dev server stopped. Closing API window...
taskkill /F /FI "WINDOWTITLE eq Prism API (dev)" /T >nul 2>&1

:end
endlocal
exit /b 0

:cleanupPorts
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cleanup-prism-windows.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo Cleanup warning: could not fully inspect existing Prism processes.
)
exit /b 0
