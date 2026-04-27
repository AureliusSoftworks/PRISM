@echo off
title Prism - Starting...
cd /d "%~dp0"

echo ============================================
echo   Prism - One-Click Launcher
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
