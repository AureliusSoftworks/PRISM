@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM #region agent log
call :agent_dbglog "H-BOOT" "test-installer:L2" "after_setlocal arg=%~1"
REM #endregion

REM Launch quirks:
REM - Double-click / "start *.bat" often run under cmd /c (window closes on exit).
REM - We relaunch once under cmd /k when we detect that (see DO_REL below).
REM - Or double-click run-test-installer.cmd (always keeps a normal console).
REM Env: PRISM_INSTALLER_NO_PAUSE=1 (CI: no relaunch, no pause)
REM      PRISM_INSTALLER_NORELAUNCH=1 (run in current console; used by run-test-installer.cmd)
REM      PRISM_INSTALLER_FORCE_K=1 (always relaunch under cmd /k)

if /i "%PRISM_INSTALLER_NO_PAUSE%"=="1" goto prism_smoke_main
if /i "%PRISM_INSTALLER_NORELAUNCH%"=="1" goto prism_smoke_main
if /i not "%~1"=="_stayopen" goto prism_smoke_after_stayopen_shift
shift
goto prism_smoke_main
:prism_smoke_after_stayopen_shift
REM #region agent log
call :agent_dbglog "H-PARSE" "test-installer:L18" "entered_relaunch_block"
REM #endregion

set "DO_REL=0"
if /i "!PRISM_INSTALLER_FORCE_K!"=="1" set "DO_REL=1"
REM CMDCMDLINE contains '"' and ')'; never feed it to "set /p "=Z!CC!"" — embedded
REM quotes end the assignment early and cmd reports ". was unexpected at this time."
REM #region agent log
call :agent_dbglog "H-SETP" "test-installer:L28" "before_ps_write_temp"
REM #endregion
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Join-Path $env:TEMP 'prism-smoke-cc.txt'; $t=([char]90) + [Environment]::GetCommandLine(); [IO.File]::WriteAllText($p,$t)"
REM #region agent log
call :agent_dbglog "H-SETP" "test-installer:L32" "after_ps_write_temp"
REM #endregion
if "!DO_REL!"=="1" goto prism_smoke_rel_done
findstr /i /c:".bat" "%TEMP%\prism-smoke-cc.txt" >nul && set "DO_REL=1"
REM #region agent log
call :agent_dbglog "H-FINDSTR" "test-installer:L35" "after_findstr_bat DO_REL=!DO_REL!"
REM #endregion
if "!DO_REL!"=="1" goto prism_smoke_rel_done
findstr /i /c:"/c" "%TEMP%\prism-smoke-cc.txt" >nul && set "DO_REL=1"
:prism_smoke_rel_done
del "%TEMP%\prism-smoke-cc.txt" >nul 2>&1
if "!DO_REL!"=="0" goto prism_smoke_main
REM #region agent log
call :agent_dbglog "H-RELAUNCH" "test-installer:L44" "spawning_cmd_k DO_REL=1"
REM #endregion

start "Prism Server smoke test" cmd.exe /k call "%~f0" _stayopen %*
exit /b 0

:prism_smoke_main
REM #region agent log
call :agent_dbglog "H-LATER" "test-installer:L52" "prism_smoke_main_entry arg1=%~1"
REM #endregion
echo.
echo [Prism Server] Smoke test running...
echo     Script: %~f0
echo.
REM From an open terminal you can run this .bat directly. For CI use PRISM_INSTALLER_NO_PAUSE=1.

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"
if errorlevel 1 (
  echo ERROR: Could not change directory to repo root:
  echo   "%REPO_ROOT%"
  goto die
)
if not exist "package.json" (
  echo ERROR: package.json not found. Expected LocalAI repo root:
  echo   "%REPO_ROOT%"
  echo Run this script from a full checkout, or open cmd, cd to the repo root, then run:
  echo   apps\server-windows\scripts\test-installer.bat
  goto die
)

set "VERSION=%~1"
if "%VERSION%"=="" set "VERSION=0.2.0"

set "PUBLISH_DIR=apps\server-windows\src\bin\Release\net8.0-windows\win-x64\publish"
set "RUNTIME_DIR=%PUBLISH_DIR%\runtime"
set "INSTALLER=apps\server-windows\dist\Prism-Server-Setup-v%VERSION%-win-x64.exe"
set "PUBLISHED_EXE=%PUBLISH_DIR%\Prism Server.exe"
set "APP_LOG=%LOCALAPPDATA%\Prism\Logs\windows-app.log"
set "FALLBACK_APP_LOG=%TEMP%\Prism\Logs\windows-app.log"

echo ============================================
echo   Prism Server Windows Installer Smoke Test
echo   Version: %VERSION%
echo ============================================
echo.

where npm >nul 2>&1 || goto missing_npm
where dotnet >nul 2>&1 || goto missing_dotnet

set "PWSH_EXE="
where pwsh >nul 2>&1 && set "PWSH_EXE=pwsh"
if not defined PWSH_EXE where powershell >nul 2>&1 && set "PWSH_EXE=powershell"
if not defined PWSH_EXE (
  echo ERROR: PowerShell was not found on PATH ^(tried pwsh, then powershell^).
  echo Install PowerShell 7 from https://aka.ms/powershell-release-page - or use Windows PowerShell (included with Windows).
  goto die
)

echo [using %PWSH_EXE% for packaging scripts]
echo [1/5] Installing Node dependencies...
call npm ci
if errorlevel 1 goto failed

echo.
echo [2/5] Running .NET unit tests...
dotnet test apps\server-windows\tests\PrismServer.Tests.csproj -c Release -f net8.0
if errorlevel 1 goto failed

echo.
echo [3/5] Publishing Prism Server.exe...
dotnet publish apps\server-windows\src\PrismServer.csproj ^
  -c Release ^
  -r win-x64 ^
  --self-contained true ^
  /p:PublishSingleFile=true ^
  /p:Version=%VERSION%
if errorlevel 1 goto failed

echo.
echo [diagnostic] Published EXE: %PUBLISHED_EXE%
echo [diagnostic] App log:       %APP_LOG%
echo [diagnostic] Fallback log:  %FALLBACK_APP_LOG%
echo.
set /p RUN_PUBLISHED="Run the freshly published EXE once before packaging? [Y/N] "
if /I "%RUN_PUBLISHED%"=="Y" start "" "%PUBLISHED_EXE%"
if /I "%RUN_PUBLISHED%"=="YES" start "" "%PUBLISHED_EXE%"

echo.
echo [4/5] Staging runtime, Node, and Qdrant...
"%PWSH_EXE%" -NoProfile -ExecutionPolicy Bypass -File "apps\server-windows\scripts\build-runtime.ps1" ^
  -OutputDir "%RUNTIME_DIR%" ^
  -VendorNode ^
  -VendorQdrant
if errorlevel 1 goto failed

echo.
echo [5/5] Building Inno Setup installer...
"%PWSH_EXE%" -NoProfile -ExecutionPolicy Bypass -File "apps\server-windows\scripts\build-installer.ps1" -Version %VERSION%
if errorlevel 1 goto failed

echo.
echo ============================================
echo   Installer ready:
echo   %INSTALLER%
echo.
echo   If Prism Server crashes, inspect:
echo   %APP_LOG%
echo   %FALLBACK_APP_LOG%
echo ============================================
echo.

set /p RUN_INSTALLER="Run the installer now? [Y/N] "
if /I "%RUN_INSTALLER%"=="Y" start "" "%INSTALLER%"
if /I "%RUN_INSTALLER%"=="YES" start "" "%INSTALLER%"

goto end

:die
call :maybe_pause
exit /b 1

:missing_npm
echo ERROR: npm was not found. Install Node 22, then rerun this script.
goto failed

:missing_dotnet
echo ERROR: dotnet was not found. Install the .NET 8 SDK, then rerun this script.
goto failed

:failed
echo.
echo Prism Server installer smoke test failed.
call :maybe_pause
exit /b 1

:end
endlocal
call :maybe_pause_outside_setlocal
exit /b 0

:maybe_pause_outside_setlocal
setlocal EnableExtensions
if /i "%PRISM_INSTALLER_NO_PAUSE%"=="1" goto :eof
echo.
echo Press any key to close this window...
pause >nul
endlocal
goto :eof

:maybe_pause
if /i "%PRISM_INSTALLER_NO_PAUSE%"=="1" goto :eof
echo.
echo Press any key to close this window...
pause >nul
goto :eof

REM #region agent log
:agent_dbglog
setlocal DisableDelayedExpansion
set "AG_H=%~1"
set "AG_LOC=%~2"
set "AG_MSG=%~3"
for %%I in ("%~dp0..\..\..") do set "AG_RR=%%~fI"
set "AG_LOG=%AG_RR%\.cursor\debug-f8735d.log"
if not exist "%AG_RR%\.cursor" mkdir "%AG_RR%\.cursor" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$j=@{sessionId='f8735d';hypothesisId=$env:AG_H;location=$env:AG_LOC;message=$env:AG_MSG;timestamp=[int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())}; Add-Content -LiteralPath $env:AG_LOG -Value (ConvertTo-Json -InputObject $j -Compress) -Encoding utf8"
endlocal
goto :eof
REM #endregion
