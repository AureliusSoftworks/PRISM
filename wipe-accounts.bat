@echo off
setlocal
title Prism - Wipe Accounts
cd /d "%~dp0"

echo ============================================
echo   Prism - Wipe All Accounts
echo ============================================
echo.
echo This will permanently delete all accounts and
echo all user-owned chats, sessions, memories, bots,
echo images, and exports from the local database.
echo It will also clear the Qdrant memory vector
echo collection if Qdrant is running.
echo.

REM ── Precondition 1: Docker Compose stack ──────────────────────────────
REM If the API container is up, the live DB lives inside the `api_data`
REM volume, not in ./apps/api/data/. The host-side wipe would write to a
REM file the API never touches — classic "I wiped and can still log in".
where docker >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "usebackq delims=" %%i in (`docker compose ps -q api 2^>nul`) do set "COMPOSE_API_ID=%%i"
    if defined COMPOSE_API_ID (
        echo ERROR: The Docker Compose API container is running.
        echo.
        echo A host-side wipe would not affect the container's database.
        echo To reset a Docker deployment:
        echo     docker compose down
        echo     docker volume rm localai-local_api_data localai-local_qdrant_data
        echo     docker compose up -d
        echo.
        pause
        exit /b 1
    )
)

REM ── Precondition 2: Native API running ────────────────────────────────
REM If port 8787 has a listener, a `node ... server.ts` is still holding
REM the DB. Even when the wipe "succeeds" at write-time, WAL pages and the
REM live connection can keep the old accounts readable until the API
REM restarts.
netstat -ano | findstr /R /C:"TCP .*:8787 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ERROR: Something is listening on port 8787.
    echo.
    echo The Prism API is still running. Close the Prism API console
    echo (or stop your API process) and then rerun this script.
    echo.
    pause
    exit /b 1
)

set /p CONFIRM=Type WIPE to continue: 
if /I not "%CONFIRM%"=="WIPE" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo Attempting wipe...
node scripts\wipe-accounts.mjs
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Wipe failed. If the database is locked, close any remaining
    echo Prism windows and try again.
    pause
    exit /b 1
)

echo.
echo All accounts wiped successfully.
echo If you were still signed in on any device, refresh the page
echo (the old session cookie will point at a user that no longer exists).
pause
endlocal
