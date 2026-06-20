@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

set "DB_PATH=%CD%\apps\api\data\localai-dev.db"
set "API_PORT=18789"
set "NEXT_TELEMETRY_DISABLED=1"

node --env-file-if-exists=.env --watch --experimental-strip-types apps\api\src\server.ts
