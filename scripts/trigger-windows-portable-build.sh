#!/usr/bin/env bash
# Trigger "Build Windows server portable (artifact)" on GitHub and download the ZIP.
# Requires: gh cli, auth (gh auth login), branch pushed to origin.
#
# Usage: scripts/trigger-windows-portable-build.sh <version-label> [ref]
# Example: scripts/trigger-windows-portable-build.sh 0.1.0
# Example: scripts/trigger-windows-portable-build.sh dev-smoke dev
set -euo pipefail

VERSION_LABEL="${1:?Usage: $0 <version-label> [git-ref]}"
REF="${2:-$(git branch --show-current)}"
WORKFLOW_FILE="build-server-windows-portable-artifact.yml"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${REPO_ROOT}/dist/windows-portable/${VERSION_LABEL}"

cd "${REPO_ROOT}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI (brew install gh) and run: gh auth login" >&2
  exit 1
fi

echo "Dispatching ${WORKFLOW_FILE} on ref '${REF}' with version_label='${VERSION_LABEL}'..."
gh workflow run "${WORKFLOW_FILE}" --ref "${REF}" -f "version_label=${VERSION_LABEL}"

echo "Waiting for workflow run to appear..."
sleep 4

RUN_ID="$(gh run list --workflow="${WORKFLOW_FILE}" --branch "${REF}" --limit 1 --json databaseId --jq '.[0].databaseId')"
if [[ -z "${RUN_ID}" || "${RUN_ID}" == "null" ]]; then
  echo "Could not find a run for workflow ${WORKFLOW_FILE} on branch ${REF}." >&2
  echo "Open https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions" >&2
  exit 1
fi

echo "Watching run ${RUN_ID}..."
gh run watch "${RUN_ID}" --exit-status

mkdir -p "${OUT_DIR}"
gh run download "${RUN_ID}" --dir "${OUT_DIR}"

echo "Done. Artifact(s) under: ${OUT_DIR}"
find "${OUT_DIR}" -maxdepth 3 -type f
