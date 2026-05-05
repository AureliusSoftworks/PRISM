---
title: "docs/release-process.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/release-process.md"
status: "active"
---

# docs/release-process.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[04-docs/docs/prism-server-app.md]]
- [[04-docs/docs/production-readiness-gate.md]]

## Referenced by
- [[04-docs/README.md]]

## Source path
- `docs/release-process.md`

## Body preview
```markdown
# Prism Release Process

This runbook defines the production release flow for Prism:

- `dev` is the integration branch.
- `main` is release-only.
- Release automation runs from `main` and creates two draft release lanes:
  - `Prism Server` draft release on GitHub
  - `Prism Client` private-lane tracking release (actual binary stays in
  invite-only TestFlight)

## Release Channel Semantics

To avoid ambiguity:

- GitHub **draft** releases are unpublished and can be reviewed before exposure.
- GitHub published releases in a public repository are public.
- Apple **unlisted** is low-discovery, not true privacy.
- Apple **private** for this workflow means invite-only TestFlight distribution.

## dev -> main Promotion Contract

Before promoting to `main`, complete:

1. Production readiness gate from `docs/production-readiness-gate.md`
2. Required tests/lint/typecheck for the release candidate
3. `CHANGELOG.md` update for the target version
4. Merge `dev` into `main` through normal review

Automation support:

- `.github/workflows/promote-dev-to-main.yml` runs on pull requests targeting
`main`.
- It enforces `head_ref == dev` and reruns workspace `typecheck` + `lint`.
- This prevents accidental non-release branches from being merged into `main`.

## Release Workflow

Workflow file: `.github/workflows/release-main.yml`

Trigger:

- Manual dispatch from `main` only

Inputs:

- `version`: shared semantic version without leading `v` (example: `0.2.0`)
- `client_testflight_build`: required App Store Connect/TestFlight build marker

Validation guards:

- `version` must match semantic-version core format (`x.y.z`)
- `CHANGELOG.md` must contain `## [<version>]` before release creation

Output lanes:

1. **Server lane**
  - Tag: `server/v<version>`
  - GitHub draft release: `Prism Server v<version>`
  - Assets:
    - `prism-server-v<version>-bundle.tar.gz` for self-builders, source audit,
      and custom deployments (not the primary Linux download).
    - `Prism-Server-v<version>-linux-x64.tar.gz` from the Linux workflow
      (vendored Node + Qdrant + `start.sh`) for x86_64 Linux servers.
    - `Prism-Server-v<version>.dmg` from the macOS app workflow for Mac users.
    - `

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
