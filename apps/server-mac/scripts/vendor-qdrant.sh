#!/usr/bin/env bash
# Vendor a universal (arm64 + x64) Qdrant binary for embedding in Prism Server.app.
# Does not commit the output; run locally or in CI before xcodebuild when VENDOR_QDRANT=1.
set -euo pipefail

QDRANT_VERSION="${QDRANT_VERSION:-1.17.1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/../build/qdrant-vendor"
OUTPUT_FILE="${1:-${SCRIPT_DIR}/../Resources/qdrant}"
BASE_URL="https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}"

ARM_TARBALL="qdrant-aarch64-apple-darwin.tar.gz"
X64_TARBALL="qdrant-x86_64-apple-darwin.tar.gz"

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "$(dirname "${OUTPUT_FILE}")"

download_one() {
  local tarball="$1"
  local label="$2"
  local sub="${BUILD_DIR}/unpack-${label}"
  mkdir -p "${sub}"
  curl --fail --location --show-error "${BASE_URL}/${tarball}" --output "${sub}/${tarball}"
  tar -xzf "${sub}/${tarball}" -C "${sub}"
  local bin
  bin="$(find "${sub}" -maxdepth 4 -name qdrant -type f 2>/dev/null | head -1)"
  if [ -z "${bin}" ] || [ ! -f "${bin}" ]; then
    echo "Could not locate qdrant executable in ${tarball}" >&2
    exit 1
  fi
  chmod +x "${bin}"
  cp "${bin}" "${BUILD_DIR}/qdrant-${label}"
}

download_one "${ARM_TARBALL}" "arm64"
download_one "${X64_TARBALL}" "x64"

lipo -create \
  "${BUILD_DIR}/qdrant-arm64" \
  "${BUILD_DIR}/qdrant-x64" \
  -output "${OUTPUT_FILE}"

chmod +x "${OUTPUT_FILE}"
echo "Vendored universal Qdrant ${QDRANT_VERSION} at ${OUTPUT_FILE}"
