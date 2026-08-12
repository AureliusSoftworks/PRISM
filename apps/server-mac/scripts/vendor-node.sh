#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.22.2}"
EXPECTED_ARM64_SHA256="db4b275b83736df67533529a18cc55de2549a8329ace6c7bcc68f8d22d3c9000"
EXPECTED_X64_SHA256="12a6abb9c2902cf48a21120da13f87fde1ed1b71a13330712949e8db818708ba"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/../build/node-vendor"
OUTPUT_DIR="${1:-${SCRIPT_DIR}/../Resources/node}"

BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
ARM64_TARBALL="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
X64_TARBALL="node-v${NODE_VERSION}-darwin-x64.tar.gz"

if [[ "${NODE_VERSION}" != "22.22.2" ]]; then
  echo "Node runtime version must match scripts/node-runtime-manifest.json (22.22.2)." >&2
  exit 64
fi

rm -rf "${BUILD_DIR}" "${OUTPUT_DIR}"
mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}/bin"

download_and_extract() {
  local tarball="$1"
  local arch="$2"
  local expected_sha256="$3"
  curl --fail --location --show-error "${BASE_URL}/${tarball}" --output "${BUILD_DIR}/${tarball}"
  local actual_sha256
  actual_sha256="$(shasum -a 256 "${BUILD_DIR}/${tarball}" | awk '{print $1}')"
  if [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
    echo "Node.js archive checksum mismatch for ${tarball}: expected ${expected_sha256}, got ${actual_sha256}." >&2
    exit 1
  fi
  tar -xzf "${BUILD_DIR}/${tarball}" -C "${BUILD_DIR}"
  mv "${BUILD_DIR}/node-v${NODE_VERSION}-darwin-${arch}" "${BUILD_DIR}/${arch}"
}

download_and_extract "${ARM64_TARBALL}" "arm64" "${EXPECTED_ARM64_SHA256}"
download_and_extract "${X64_TARBALL}" "x64" "${EXPECTED_X64_SHA256}"

lipo -create \
  "${BUILD_DIR}/arm64/bin/node" \
  "${BUILD_DIR}/x64/bin/node" \
  -output "${OUTPUT_DIR}/bin/node"

chmod +x "${OUTPUT_DIR}/bin/node"
ditto "${BUILD_DIR}/arm64/include" "${OUTPUT_DIR}/include"
ditto "${BUILD_DIR}/arm64/lib" "${OUTPUT_DIR}/lib"
ditto "${BUILD_DIR}/arm64/share" "${OUTPUT_DIR}/share"
install -m 0644 "${BUILD_DIR}/arm64/LICENSE" "${OUTPUT_DIR}/LICENSE"

echo "Vendored verified universal Node ${NODE_VERSION} at ${OUTPUT_DIR}"
