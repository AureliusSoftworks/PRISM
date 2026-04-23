@echo off
title Prism - Wipe Accounts
cd /d "%~dp0"

echo ============================================
echo   Prism - Wipe All Accounts
echo ============================================
echo.
echo This will permanently delete all accounts and
echo all user-owned chats, sessions, memories, bots,
echo images, and exports from the local database.
echo.
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
    echo Wipe failed. If the database is locked, close the app windows started by start.bat and try again.
    pause
    exit /b 1
)

echo.
echo All accounts wiped successfully.
pause
