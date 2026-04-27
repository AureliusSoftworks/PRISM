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

echo "Building Prism server runtime..."
npm run build

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

echo "Staging API runtime..."
mkdir -p "${OUTPUT_DIR}/apps/api" "${OUTPUT_DIR}/apps/web/.next" "${OUTPUT_DIR}/node_modules/@localai"
ditto "apps/api/dist" "${OUTPUT_DIR}/apps/api/dist"
ditto "apps/api/package.json" "${OUTPUT_DIR}/apps/api/package.json"
ditto "package.json" "${OUTPUT_DIR}/package.json"
ditto "package-lock.json" "${OUTPUT_DIR}/package-lock.json"

echo "Staging API production dependencies..."
ditto "packages/config" "${OUTPUT_DIR}/node_modules/@localai/config"
ditto "packages/shared" "${OUTPUT_DIR}/node_modules/@localai/shared"
ditto "node_modules/dnssd-advertise" "${OUTPUT_DIR}/node_modules/dnssd-advertise"

echo "Staging Next.js standalone runtime..."
ditto "apps/web/.next/standalone" "${OUTPUT_DIR}/apps/web/.next/standalone"
mkdir -p "${OUTPUT_DIR}/apps/web/.next/standalone/apps/web/.next"
ditto "apps/web/.next/static" "${OUTPUT_DIR}/apps/web/.next/standalone/apps/web/.next/static"
if [ -d "apps/web/public" ]; then
  ditto "apps/web/public" "${OUTPUT_DIR}/apps/web/.next/standalone/apps/web/public"
fi

echo "Runtime staged at ${OUTPUT_DIR}"

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
