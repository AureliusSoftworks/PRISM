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
