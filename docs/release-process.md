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
    - `prism-server-v<version>-bundle.tar.gz` for self-builders, Linux users,
      Docker/manual deployments, and source audit.
    - `Prism-Server-v<version>.dmg` from the macOS app workflow for end users.
2. **Client lane**
  - Tag: `client/v<version>`
  - GitHub draft release: `Prism Client v<version> (Private Lane)`
  - Asset: private-lane manifest text file with TestFlight reference
  - Actual iOS/macOS binary remains in private TestFlight, not GitHub

## Publish Decision

Only publish the server draft release after:

- deployment gate checks pass
- rollback path is validated
- release notes are reviewed

The client lane stays a private TestFlight handoff pointer unless and until the
native client distribution policy changes.

## macOS Server App Workflow

Workflow file: `.github/workflows/release-server-mac.yml`

Trigger:

- Manual dispatch from `main` only, after `.github/workflows/release-main.yml`
  has created the `server/v<version>` draft release.

Inputs:

- `version`: shared semantic version without leading `v` (example: `0.2.0`)

Output:

- Signed and notarized `Prism-Server-v<version>.dmg` uploaded to the existing
  `server/v<version>` GitHub Release.

Required secrets:

- `DEVELOPER_ID_APPLICATION`
- `APPLE_TEAM_ID`
- `APPLE_DEVELOPER_ID_CERT_BASE64`
- `APPLE_DEVELOPER_ID_CERT_PASSWORD`
- `APPLE_NOTARYTOOL_APPLE_ID`
- `APPLE_NOTARYTOOL_APP_SPECIFIC_PASSWORD`

See `docs/prism-server-app.md` for the local build, signing, notarization, and
DMG packaging details.