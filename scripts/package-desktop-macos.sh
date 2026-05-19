#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version e.g. 0.2.0>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist-desktop"

cd "${REPO_ROOT}"

echo "Staging desktop runtime..."
npm run desktop:stage-runtime

echo "Ensuring Rust targets for macOS universal build..."
if ! rustup target list --installed | grep -qx "aarch64-apple-darwin"; then
  rustup target add aarch64-apple-darwin
fi
if ! rustup target list --installed | grep -qx "x86_64-apple-darwin"; then
  rustup target add x86_64-apple-darwin
fi

echo "Building Tauri macOS universal bundle (arm64 + x86_64)..."
npm run tauri -w apps/desktop -- build --target universal-apple-darwin

shopt -s nullglob
app_bundles=(apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app)
shopt -u nullglob
APP_BUNDLE="${app_bundles[0]:-}"
if [ -z "${APP_BUNDLE}" ]; then
  echo "Could not find generated .app in apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos" >&2
  exit 1
fi

APP_NAME="$(basename "${APP_BUNDLE}" .app)"
APP_BINARY="${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"
if [ ! -f "${APP_BINARY}" ]; then
  # Fallback for cases where Tauri's app executable name differs from the app bundle name.
  APP_BINARY="$(ls -1 "${APP_BUNDLE}/Contents/MacOS/"* 2>/dev/null | head -1 || true)"
  if [ -z "${APP_BINARY}" ] || [ ! -f "${APP_BINARY}" ]; then
    echo "Could not find app binary at ${APP_BUNDLE}/Contents/MacOS/" >&2
    exit 1
  fi
fi

LIPO_OUTPUT="$(lipo -info "${APP_BINARY}")"
echo "Universal binary check: ${LIPO_OUTPUT}"
if [[ "${LIPO_OUTPUT}" != *"x86_64"* || "${LIPO_OUTPUT}" != *"arm64"* ]]; then
  echo "Universal macOS bundle is missing one architecture slice (expected x86_64 and arm64)." >&2
  exit 1
fi

DMG_SOURCE="$(ls -1 apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg 2>/dev/null | head -1)"
if [ -z "${DMG_SOURCE}" ]; then
  # Fallback keeps local/manual builds working if a different target path is used.
  DMG_SOURCE="$(ls -1 apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)"
fi
if [ -z "${DMG_SOURCE}" ]; then
  echo "Could not find generated DMG in Tauri target bundle directories" >&2
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
