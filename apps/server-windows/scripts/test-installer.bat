@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

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
where pwsh >nul 2>&1 || goto missing_pwsh

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
pwsh -NoProfile -ExecutionPolicy Bypass -File apps\server-windows\scripts\build-runtime.ps1 ^
  -OutputDir "%RUNTIME_DIR%" ^
  -VendorNode ^
  -VendorQdrant
if errorlevel 1 goto failed

echo.
echo [5/5] Building Inno Setup installer...
pwsh -NoProfile -ExecutionPolicy Bypass -File apps\server-windows\scripts\build-installer.ps1 -Version %VERSION%
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

:missing_npm
echo ERROR: npm was not found. Install Node 22, then rerun this script.
goto failed

:missing_dotnet
echo ERROR: dotnet was not found. Install the .NET 8 SDK, then rerun this script.
goto failed

:missing_pwsh
echo ERROR: pwsh was not found. Install PowerShell 7, then rerun this script.
goto failed

:failed
echo.
echo Prism Server installer smoke test failed.
exit /b 1

:end
endlocal
