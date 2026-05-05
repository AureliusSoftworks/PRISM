#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_PATH="$REPO_ROOT/.git/hooks/post-commit"

mkdir -p "$(dirname "$HOOK_PATH")"

cat > "$HOOK_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if command -v npm >/dev/null 2>&1; then
  npm run kb:incremental >/dev/null 2>&1 || true
fi
EOF

chmod +x "$HOOK_PATH"
echo "Installed post-commit hook: $HOOK_PATH"
