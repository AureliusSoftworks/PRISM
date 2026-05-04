@echo off
REM Double-click this file in Explorer. It cds to the repo root and runs the smoke test
REM in a console that stays open at the end (final pause survives cmd /c from Explorer).
title Prism Server smoke test
cd /d "%~dp0..\..\.."
if not exist "package.json" (
  echo ERROR: package.json not found.
  echo This file must live at: LocalAI\apps\server-windows\scripts\run-test-installer.cmd
  echo Current directory:
  cd
  pause
  exit /b 1
)
set "PRISM_INSTALLER_NORELAUNCH=1"
call "%~dp0test-installer.bat" %*
echo.
echo run-test-installer.cmd finished.
pause
