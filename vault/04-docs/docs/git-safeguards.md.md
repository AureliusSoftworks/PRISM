---
title: "docs/git-safeguards.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/git-safeguards.md"
status: "active"
---

# docs/git-safeguards.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[04-docs/README.md]]

## Source path
- `docs/git-safeguards.md`

## Body preview
```markdown
# Local Git Safeguards (No-Cost)

This project includes local git safeguards to reduce accidental destructive
pushes on protected branches without requiring paid GitHub branch protection.

## What it protects

- Blocks non-fast-forward pushes to `dev`
- Blocks deleting `dev` via push

## What it does not protect

- Actions from other machines that do not have this hook installed
- Destructive actions in GitHub's web UI

These safeguards are a seatbelt, not server-side enforcement.

## Install

```bash
bash scripts/install_git_safeguards.sh
```

## Verify

1. Confirm the installed hook exists at `.git/hooks/pre-push`.
2. Open `.git/hooks/pre-push` and verify it references protected branches.
3. Use normal push flow; destructive pushes should be blocked locally.

There is no built-in bypass path in this temporary safeguard.

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
