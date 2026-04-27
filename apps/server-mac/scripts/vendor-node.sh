#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.12.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/../build/node-vendor"
OUTPUT_DIR="${1:-${SCRIPT_DIR}/../Resources/node}"

BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
ARM64_TARBALL="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
X64_TARBALL="node-v${NODE_VERSION}-darwin-x64.tar.gz"

rm -rf "${BUILD_DIR}" "${OUTPUT_DIR}"
mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}/bin"

download_and_extract() {
  local tarball="$1"
  local arch="$2"
  curl --fail --location --show-error "${BASE_URL}/${tarball}" --output "${BUILD_DIR}/${tarball}"
  tar -xzf "${BUILD_DIR}/${tarball}" -C "${BUILD_DIR}"
  mv "${BUILD_DIR}/node-v${NODE_VERSION}-darwin-${arch}" "${BUILD_DIR}/${arch}"
}

download_and_extract "${ARM64_TARBALL}" "arm64"
download_and_extract "${X64_TARBALL}" "x64"

lipo -create \
  "${BUILD_DIR}/arm64/bin/node" \
  "${BUILD_DIR}/x64/bin/node" \
  -output "${OUTPUT_DIR}/bin/node"

chmod +x "${OUTPUT_DIR}/bin/node"
ditto "${BUILD_DIR}/arm64/include" "${OUTPUT_DIR}/include"
ditto "${BUILD_DIR}/arm64/lib" "${OUTPUT_DIR}/lib"
ditto "${BUILD_DIR}/arm64/share" "${OUTPUT_DIR}/share"

echo "Vendored universal Node ${NODE_VERSION} at ${OUTPUT_DIR}"
