#!/usr/bin/env bash
set -euo pipefail

APP_ID="${1:?Usage: $0 <app_id> [steam_build_root]}"
STEAM_BUILD_ROOT="${2:-steam-build}"
SCRIPTS_DIR="${STEAM_BUILD_ROOT}/scripts"
APP_BUILD_VDF="${SCRIPTS_DIR}/app_build_${APP_ID}.vdf"

if [ ! -f "${APP_BUILD_VDF}" ]; then
  echo "Missing app build script: ${APP_BUILD_VDF}" >&2
  exit 1
fi

if [ -z "${STEAM_BUILDER_USERNAME:-}" ] || [ -z "${STEAM_BUILDER_PASSWORD:-}" ]; then
  echo "Set STEAM_BUILDER_USERNAME and STEAM_BUILDER_PASSWORD before upload." >&2
  exit 1
fi

STEAMCMD_BIN="${STEAMCMD_BIN:-steamcmd}"

echo "Running Steam build upload for app ${APP_ID}..."
"${STEAMCMD_BIN}" \
  +login "${STEAM_BUILDER_USERNAME}" "${STEAM_BUILDER_PASSWORD}" \
  +run_app_build "$(cd "${SCRIPTS_DIR}" && pwd)/$(basename "${APP_BUILD_VDF}")" \
  +quit
