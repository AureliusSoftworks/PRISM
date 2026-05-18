#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version e.g. 0.2.0>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist-desktop"

cd "${REPO_ROOT}"

echo "Staging desktop runtime..."
npm run desktop:stage-runtime

echo "Building Tauri Linux bundle..."
npm run build -w apps/desktop

APPIMAGE_SOURCE="$(ls -1 apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null | head -1)"
if [ -z "${APPIMAGE_SOURCE}" ]; then
  echo "Could not find generated AppImage in apps/desktop/src-tauri/target/release/bundle/appimage" >&2
  exit 1
fi

mkdir -p "${DIST_DIR}"
APPIMAGE_TARGET="${DIST_DIR}/Prism-Desktop-v${VERSION}-linux-x64.AppImage"
cp "${APPIMAGE_SOURCE}" "${APPIMAGE_TARGET}"

# Optional Linux signing hook for CI (for example cosign or gpg flows).
if [ -n "${PRISM_DESKTOP_LINUX_SIGN_SCRIPT:-}" ]; then
  if [ ! -x "${PRISM_DESKTOP_LINUX_SIGN_SCRIPT}" ]; then
    echo "PRISM_DESKTOP_LINUX_SIGN_SCRIPT is set but not executable: ${PRISM_DESKTOP_LINUX_SIGN_SCRIPT}" >&2
    exit 1
  fi
  "${PRISM_DESKTOP_LINUX_SIGN_SCRIPT}" "${APPIMAGE_TARGET}" "${VERSION}"
fi

echo "Wrote ${APPIMAGE_TARGET}"
