#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_DIR="${1:-${TARGET_BUILD_DIR:-}/$(basename "${UNLOCALIZED_RESOURCES_FOLDER_PATH:-}")/runtime}"
RESOURCE_DIR="$(dirname "${OUTPUT_DIR}")"

if [ -z "${OUTPUT_DIR}" ] || [ "${OUTPUT_DIR}" = "/runtime" ]; then
  echo "Usage: build-runtime.sh <output-runtime-dir>"
  exit 64
fi

cd "${REPO_ROOT}"

echo "Staging Prism runtime with shared script..."
node "${REPO_ROOT}/scripts/stage-desktop-runtime.mjs" --output-dir "${OUTPUT_DIR}"

NODE_OUTPUT_DIR="${RESOURCE_DIR}/node"
if [ "${VENDOR_NODE:-0}" = "1" ]; then
  echo "Vendoring Node into ${NODE_OUTPUT_DIR}..."
  "${SCRIPT_DIR}/vendor-node.sh" "${NODE_OUTPUT_DIR}"
elif [ -x "${SCRIPT_DIR}/../Resources/node/bin/node" ]; then
  echo "Copying pre-vendored Node from apps/server-mac/Resources/node..."
  rm -rf "${NODE_OUTPUT_DIR}"
  ditto "${SCRIPT_DIR}/../Resources/node" "${NODE_OUTPUT_DIR}"
else
  echo "No bundled Node staged; Prism Server.app will use system Node from PATH."
fi

QDRANT_DEST="${RESOURCE_DIR}/qdrant"
if [ "${VENDOR_QDRANT:-0}" = "1" ]; then
  echo "Vendoring Qdrant into ${QDRANT_DEST}..."
  "${SCRIPT_DIR}/vendor-qdrant.sh" "${QDRANT_DEST}"
elif [ -x "${SCRIPT_DIR}/../Resources/qdrant" ]; then
  echo "Copying pre-vendored Qdrant from apps/server-mac/Resources/qdrant..."
  install -m 0755 "${SCRIPT_DIR}/../Resources/qdrant" "${QDRANT_DEST}"
else
  echo "No bundled Qdrant staged; install \`qdrant\` via Homebrew or run with VENDOR_QDRANT=1."
fi
