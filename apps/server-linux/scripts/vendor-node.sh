#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.22.2}"
EXPECTED_SHA256="88fd1ce767091fd4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BUILD_DIR="${SCRIPT_DIR}/../build/node-vendor"
OUTPUT_DIR="${1:-${SCRIPT_DIR}/../Resources/node}"
ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
BASE_URL="https://nodejs.org/download/release/v${NODE_VERSION}"
ARCHIVE_PATH="${BUILD_DIR}/${ARCHIVE}"

if [[ "${NODE_VERSION}" != "22.22.2" ]]; then
  echo "Node runtime version must match scripts/node-runtime-manifest.json (22.22.2)." >&2
  exit 64
fi

rm -rf "${BUILD_DIR}" "${OUTPUT_DIR}"
mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}/bin"

curl --fail --location --show-error "${BASE_URL}/${ARCHIVE}" --output "${ARCHIVE_PATH}"
actual_sha256="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
if [[ "${actual_sha256}" != "${EXPECTED_SHA256}" ]]; then
  echo "Node.js archive checksum mismatch: expected ${EXPECTED_SHA256}, got ${actual_sha256}." >&2
  exit 1
fi

tar -xJf "${ARCHIVE_PATH}" -C "${BUILD_DIR}"
EXTRACTED_DIR="${BUILD_DIR}/node-v${NODE_VERSION}-linux-x64"
install -m 0755 "${EXTRACTED_DIR}/bin/node" "${OUTPUT_DIR}/bin/node"
install -m 0644 "${EXTRACTED_DIR}/LICENSE" "${OUTPUT_DIR}/LICENSE"

echo "Vendored verified Node ${NODE_VERSION} at ${OUTPUT_DIR}"
