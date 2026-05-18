#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version e.g. 0.2.0>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist-desktop"

cd "${REPO_ROOT}"

echo "Staging desktop runtime..."
npm run desktop:stage-runtime

echo "Building Tauri macOS bundle..."
npm run build -w apps/desktop

DMG_SOURCE="$(ls -1 apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)"
if [ -z "${DMG_SOURCE}" ]; then
  echo "Could not find generated DMG in apps/desktop/src-tauri/target/release/bundle/dmg" >&2
  exit 1
fi

mkdir -p "${DIST_DIR}"
DMG_TARGET="${DIST_DIR}/Prism-Desktop-v${VERSION}.dmg"
cp "${DMG_SOURCE}" "${DMG_TARGET}"

# Optional signing/notarization hook for CI or local secured environments.
if [ -n "${PRISM_DESKTOP_MAC_SIGN_SCRIPT:-}" ]; then
  if [ ! -x "${PRISM_DESKTOP_MAC_SIGN_SCRIPT}" ]; then
    echo "PRISM_DESKTOP_MAC_SIGN_SCRIPT is set but not executable: ${PRISM_DESKTOP_MAC_SIGN_SCRIPT}" >&2
    exit 1
  fi
  "${PRISM_DESKTOP_MAC_SIGN_SCRIPT}" "${DMG_TARGET}" "${VERSION}"
fi

echo "Wrote ${DMG_TARGET}"
