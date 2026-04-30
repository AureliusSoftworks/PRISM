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
echo images, and exports from every local Prism
echo database under apps\api\data (prod + dev DBs),
echo plus paths from .env (DB_PATH / LOCALAI_DATA_DIR).
echo It will also clear the Qdrant memory vector
echo collection if Qdrant is reachable.
echo.
echo The API must be stopped (including Docker).
echo.

set /p CONFIRM=Type WIPE to continue: 
if /I not "%CONFIRM%"=="WIPE" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo Attempting wipe...
REM Load repo .env so DB_PATH / LOCALAI_DATA_DIR / API_PORT / QDRANT_URL match the API.
node --env-file-if-exists=.env "%~dp0scripts\wipe-accounts.mjs"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Wipe aborted or failed. If the database is locked, close any Prism
    echo API windows and Docker API containers, then try again.
    pause
    exit /b 1
)

echo.
echo All known local databases were wiped successfully.
echo If you were still signed in on any device, refresh the page
echo (the old session cookie will point at a user that no longer exists).
pause
endlocal
