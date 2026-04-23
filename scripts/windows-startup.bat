@echo off
REM Prism Docker Compose boot script for Windows.
REM Place a shortcut to this file in shell:startup or register via Task Scheduler.

cd /d "%~dp0.."
docker compose up -d

echo Prism services started.
echo Web UI: http://%COMPUTERNAME%
echo API:    http://%COMPUTERNAME%:8787
