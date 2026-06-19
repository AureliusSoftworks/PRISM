# Prism Release Process

This runbook defines the desktop-only release flow.

Core branch policy:
- `dev` is the integration branch.
- `main` is release-only.

For canonical product positioning, see
[distribution-model.md](distribution-model.md). If wording conflicts, that file
wins.

## Release Channel Semantics

- GitHub **draft** releases are staging slots for upload and verification.
- Drafts are published manually after smoke checks.
- No App Store/TestFlight review step exists in this model.

## dev -> main Promotion Contract

Before promoting to `main`, complete:

1. Production readiness gate from `docs/production-readiness-gate.md`
2. Required tests/lint/typecheck for the release candidate
3. `CHANGELOG.md` entry for the target version
4. Normal reviewed merge from `dev` into `main`

Automation support:
- `.github/workflows/promote-dev-to-main.yml` enforces `head_ref == dev`
- The same workflow reruns workspace `typecheck` + `lint`

## Release Workflows (Canonical)

- `.github/workflows/release-main.yml` — top-level release entrypoint
- `.github/workflows/release-desktop-all.yml` — builds and uploads desktop artifacts

`release-main.yml` dispatches the desktop matrix workflow and should be treated
as the canonical operator trigger.

## Inputs and Guards

Release dispatch inputs:
- `version` (`x.y.z`)
- `desktop_release_channel` (optional note in draft release)

Validation guards:
- `version` must match semver core format
- `CHANGELOG.md` must include `## [<version>]`
- workflow dispatch must run from `main`

## Desktop Artifacts

Customer-facing outputs:
- `Prism-Desktop-v<version>.dmg` (macOS)
- `Prism-Desktop-Setup-v<version>-win-x64.exe` (+ optional MSI)
- `Prism-Desktop-v<version>-linux-x64.AppImage`

Release tag:
- `desktop/v<version>`

## Verification and Publish Gates

Before publishing any draft:
- install and launch each desktop artifact on a clean environment
- verify local API/web startup and first-run dependency checks
- verify release notes
- verify free-download/support copy and installer readiness

Publish is an explicit human decision after these checks.

## Operator Checklist

Use this order on `main` after merging `dev`:

1. Run preflight quality gates (`npm run typecheck`, `npm run lint`, plus release-candidate tests)
2. Dispatch **Release Pipeline (desktop-only)** with target `version`
3. Wait for matrix packaging and artifact uploads to finish
4. Smoke-test each platform artifact
5. Publish draft when validated
6. Post release links to download channels and the optional Patreon support page

Do not merge, tag, publish, or trigger store upload without explicit human confirmation in chat.
