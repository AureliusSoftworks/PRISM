#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_HOOK="$REPO_ROOT/.githooks/pre-push"
TARGET_HOOK="$REPO_ROOT/.git/hooks/pre-push"

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "Error: .git directory not found at $REPO_ROOT" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_HOOK" ]]; then
  echo "Error: source hook not found at $SOURCE_HOOK" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET_HOOK")"
cp "$SOURCE_HOOK" "$TARGET_HOOK"
chmod +x "$TARGET_HOOK"

echo "Installed pre-push safeguards to $TARGET_HOOK"
echo "Protected branch: dev"
