#!/usr/bin/env bash
# Package a self-contained Prism Server runtime for Linux x64 (GitHub Releases).
# Usage: scripts/package-linux-server-release.sh <semver-without-v> [output-dir-relative-to-repo]
set -euo pipefail

VERSION="${1:?Usage: $0 <version e.g. 0.1.0> [dist-dir]}"
OUT_DIR="${2:-dist}"
NODE_VERSION="${NODE_VERSION:-22.22.2}"
QDRANT_VERSION="${QDRANT_VERSION:-1.17.1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORK="$(mktemp -d)"
cleanup() { rm -rf "${WORK}"; }
trap cleanup EXIT

ROOT="${WORK}/prism-server"
mkdir -p "${ROOT}"
RUNTIME="${ROOT}/runtime"

cd "${REPO_ROOT}"
echo "npm ci + npm run build..."
npm ci
npm run build

rm -rf "${RUNTIME}"
mkdir -p "${RUNTIME}/apps/api" "${RUNTIME}/apps/web/.next" "${RUNTIME}/node_modules/@localai"

API_DIST_SOURCE="apps/api/dist"
if [ -f "apps/api/dist/apps/api/src/server.js" ]; then
  API_DIST_SOURCE="apps/api/dist/apps/api/src"
fi
mkdir -p "${RUNTIME}/apps/api/dist"
cp -a "${API_DIST_SOURCE}/." "${RUNTIME}/apps/api/dist/"
if [ ! -f "${RUNTIME}/apps/api/dist/server.js" ]; then
  echo "Missing staged API entrypoint: ${RUNTIME}/apps/api/dist/server.js" >&2
  exit 1
fi
cp -a "apps/api/package.json" "${RUNTIME}/apps/api/package.json"
cp -a "package.json" "${RUNTIME}/package.json"
cp -a "package-lock.json" "${RUNTIME}/package-lock.json"

cp -a "packages/config" "${RUNTIME}/node_modules/@localai/config"
cp -a "packages/shared" "${RUNTIME}/node_modules/@localai/shared"
cp -a "node_modules/dnssd-advertise" "${RUNTIME}/node_modules/dnssd-advertise"

mkdir -p "${RUNTIME}/apps/web/.next/standalone"
cp -a "apps/web/.next/standalone/." "${RUNTIME}/apps/web/.next/standalone/"
mkdir -p "${RUNTIME}/apps/web/.next/standalone/apps/web/.next"
cp -a "apps/web/.next/static/." "${RUNTIME}/apps/web/.next/standalone/apps/web/.next/static/"
if [ -d "apps/web/public" ]; then
  mkdir -p "${RUNTIME}/apps/web/.next/standalone/apps/web/public"
  cp -a "apps/web/public/." "${RUNTIME}/apps/web/.next/standalone/apps/web/public/"
fi

NODE_TGZ="node-v${NODE_VERSION}-linux-x64.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TGZ}"
echo "Downloading Node ${NODE_VERSION} (linux-x64)..."
curl --fail --location --show-error "${NODE_URL}" --output "${WORK}/${NODE_TGZ}"
tar -xzf "${WORK}/${NODE_TGZ}" -C "${WORK}"
mv "${WORK}/node-v${NODE_VERSION}-linux-x64" "${ROOT}/node"

QDRANT_TGZ="qdrant-x86_64-unknown-linux-gnu.tar.gz"
QDRANT_URL="https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/${QDRANT_TGZ}"
echo "Downloading Qdrant ${QDRANT_VERSION} (linux x64)..."
curl --fail --location --show-error "${QDRANT_URL}" --output "${WORK}/${QDRANT_TGZ}"
mkdir -p "${WORK}/qunpack"
tar -xzf "${WORK}/${QDRANT_TGZ}" -C "${WORK}/qunpack"
QBIN="$(find "${WORK}/qunpack" -maxdepth 4 -name qdrant -type f 2>/dev/null | head -1)"
if [ -z "${QBIN}" ] || [ ! -f "${QBIN}" ]; then
  echo "Could not locate qdrant in ${QDRANT_TGZ}" >&2
  exit 1
fi
install -m 0755 "${QBIN}" "${ROOT}/qdrant"

cat > "${ROOT}/README.txt" <<EOF
Prism Server ${VERSION} (Linux x64)

Bundled: Node.js ${NODE_VERSION}, Qdrant ${QDRANT_VERSION}.

Quick start
-----------
1. tar -xzf Prism-Server-v${VERSION}-linux-x64.tar.gz
2. cd prism-server
3. Optional: in a second terminal, run ./qdrant (or set QDRANT_URL to your cluster)
4. ./start.sh

Configure Ollama (OLLAMA_HOST), encryption keys, and ports via environment
variables and .env as documented in the Prism repository.
EOF

cat > "${ROOT}/start.sh" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="${ROOT}/node/bin:${PATH}"
cd "${ROOT}/runtime"
exec node apps/api/dist/server.js
EOS
chmod +x "${ROOT}/start.sh"

mkdir -p "${REPO_ROOT}/${OUT_DIR}"
ARCHIVE="${REPO_ROOT}/${OUT_DIR}/Prism-Server-v${VERSION}-linux-x64.tar.gz"
tar -czf "${ARCHIVE}" -C "${WORK}" prism-server
echo "Wrote ${ARCHIVE}"
