#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version e.g. 0.2.0>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist-desktop"

cd "${REPO_ROOT}"

echo "Staging desktop runtime..."
npm run desktop:stage-runtime

# AppImage bundling on glibc runners can fail if Next standalone includes
# optional musl-only sharp binaries; they are not needed on this target.
echo "Pruning musl-only optional sharp binaries from staged runtime..."
rm -rf runtime/apps/web/.next/standalone/node_modules/@img/sharp-libvips-linuxmusl-x64
rm -rf runtime/apps/web/.next/standalone/node_modules/@img/sharp-linuxmusl-x64
rm -rf runtime/node_modules/@img/sharp-libvips-linuxmusl-x64
rm -rf runtime/node_modules/@img/sharp-linuxmusl-x64

# onnxruntime-node ships optional GPU execution providers alongside the CPU
# runtime. linuxdeploy treats those optional libraries as required ELF inputs
# and fails on clean CI runners that do not have CUDA/ROCm installed.
echo "Pruning optional GPU providers from staged ONNX runtime..."
find runtime -type f \( -name "libonnxruntime_providers_cuda.so" -o -name "libonnxruntime_providers_tensorrt.so" -o -name "libonnxruntime_providers_rocm.so" \) -print -delete

echo "Building Tauri Linux bundle..."
# Keep AppImage packaging resilient in CI and emit detailed linuxdeploy diagnostics.
export APPIMAGE_EXTRACT_AND_RUN="${APPIMAGE_EXTRACT_AND_RUN:-1}"
export NO_STRIP="${NO_STRIP:-1}"
export TAURI_DEBUG="${TAURI_DEBUG:-1}"
export RUST_LOG="${RUST_LOG:-debug}"
export DEBUG="${DEBUG:-1}"

if ! npm run tauri -w apps/desktop -- build --verbose; then
  echo "First Linux bundle attempt failed; retrying once..."
  npm run tauri -w apps/desktop -- build --verbose
fi

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
