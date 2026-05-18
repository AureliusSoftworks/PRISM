# Prism Release Process

This runbook defines Prism's release operator flow while we migrate from split
server/client artifacts to a unified desktop app.

Core branch policy remains unchanged:
- `dev` is the integration branch.
- `main` is release-only.

For canonical product positioning, see
[distribution-model.md](distribution-model.md). If wording conflicts, that file
wins.

## Release Channel Semantics

- GitHub **draft** releases are staging slots for upload + verification.
- Drafts are published manually after smoke checks.
- No App Store/TestFlight review step exists in this model.

## dev -> main Promotion Contract

Before promoting to `main`, complete:

1. Production readiness gate from `docs/production-readiness-gate.md`
2. Required tests/lint/typecheck for the release candidate
3. `CHANGELOG.md` entry for the target version
4. Normal reviewed merge from `dev` into `main`

Automation support:
- `.github/workflows/promote-dev-to-main.yml` enforces `head_ref == dev`.
- The same workflow reruns workspace `typecheck` + `lint`.

## Transitional Workflow State

Today, release workflows still produce split lanes (`server/v*`, `client/v*`).
Treat these as **transitional packaging plumbing**, not final customer-facing
product language.

Current workflow files:
- `.github/workflows/release-main.yml`
- `.github/workflows/release-server-all.yml`
- `.github/workflows/release-desktop-all.yml` (new unified desktop matrix)
- `.github/workflows/release-server-mac.yml`
- `.github/workflows/release-server-windows.yml`
- `.github/workflows/release-server-linux.yml`
- `.github/workflows/build-client-mac.yml`

Migration target:
- A single Prism Desktop release lane that emits macOS/Windows/Linux artifacts
  from one product vocabulary.

## Current Inputs and Guards

Current release dispatch uses:
- `version` (`x.y.z`)
- `client_testflight_build` (legacy placeholder input; transitional only)

Validation guards:
- `version` must match semver core format.
- `CHANGELOG.md` must include `## [<version>]`.
- workflow dispatch must run from `main`.

## Unified Desktop Target Artifacts

Target customer-facing outputs:
- `Prism-Desktop-v<version>.dmg` (macOS)
- `Prism-Desktop-Setup-v<version>-win-x64.exe` (+ optional portable ZIP)
- `Prism-Desktop-v<version>-linux-x64.tar.gz` (AppImage follow-up)

During migration, existing server/client filenames may still be emitted by
legacy workflows. Operator release notes should map them to "Prism Desktop
transitional packaging" until naming is fully switched.

## Verification and Publish Gates

Before publishing any draft:
- install and launch each desktop artifact on a clean environment
- verify internal API/web startup and first-run dependency checks
- verify release notes
- verify entitlement/licensing flow for paid desktop use path

Publish is an explicit human decision after these checks.

## /🏗️ build Operator Checklist

Use this order on `main` after merging `dev`:

1. Run preflight quality gates (`npm run typecheck`, `npm run lint`, plus
   release-candidate tests).
2. Dispatch release draft workflow(s) with target `version`.
3. Build/upload platform artifacts.
4. Smoke-test each platform artifact.
5. Publish draft when validated.
6. Post release links to distribution channels (Patreon and/or storefront).

Do not merge, tag, publish, or trigger store upload without explicit human
confirmation in chat.