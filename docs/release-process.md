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
    - `Prism-Server-Setup-v<version>-win-x64.exe` from the Windows workflow.
    - `Prism-Server-v<version>-win-x64-portable.zip` from the same Windows workflow (no installer).
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

## Linux Server bundle workflow

Workflow file: `.github/workflows/release-server-linux.yml`

Trigger:

- Manual dispatch from `main` only, after `release-main.yml` has created the
  `server/v<version>` draft release (same as macOS/Windows server workflows).

Inputs:

- `version`: semantic version without leading `v` (example: `0.1.0`)

Output:

- `Prism-Server-v<version>-linux-x64.tar.gz` uploaded to the existing
  `server/v<version>` GitHub Release.

Local packaging (any OS with bash, for debugging):

- `scripts/package-linux-server-release.sh <version> [dist-dir]`

## Orchestrator (draft + all server platforms)

Workflow file: `.github/workflows/release-server-all.yml`

Trigger:

- Manual dispatch from `main` only (same inputs as `release-main.yml`, plus an optional **Build Mac client** checkbox).

Behavior:

- Runs the same preflight checks and **draft** `server/v*` + `client/v*` setup as
  `release-main.yml` (including the dev `prism-server-v*-bundle.tar.gz` upload).
- Then runs **in parallel**: macOS DMG, Windows (installer + portable ZIP), and
  Linux runtime tarball workflows.
- Optionally runs `build-client-mac.yml` afterward (workflow artifact only).

Use this when you want **one workflow** instead of separate Actions runs per platform.

## Native client builds (not on GitHub Releases)

Retail **Prism Client** binaries are sold through the App Store (future /
TestFlight today). CI still produces **internal artifacts** for QA:

- **macOS:** `.github/workflows/build-client-mac.yml` — uploads `Prism.app` as
  a workflow artifact only (no `gh release upload`).
- **Windows:** `.github/workflows/build-client-windows.yml` — placeholder until
  `apps/client-windows` exists; then replace with a real build + artifact upload.

## /🏗️ build — operator quick checklist

Use this order on **`main`** after merging `dev` (and with `CHANGELOG.md`
already listing `## [<version>]`):

1. **Preflight —** Run `npm run typecheck` and `npm run lint` locally or rely on CI.
2. **Draft releases —** Actions → **Release Pipeline (dev -> main)** → Run workflow:
   `version`, `client_testflight_build` (TestFlight reference string required).  
   *Or* use **Release Prism Server (all platforms)** to create the same drafts **and**
   build every server artifact in one run (optional Mac client artifact at the end).
3. **Server binaries —** If you used **Release Pipeline** only, run in any order (each requires the `server/v<version>` draft):
   - `Release Prism Server macOS App`
   - `Release Prism Server Windows App`
   - `Release Prism Server Linux bundle`
4. **Client QA artifact —** `Build Prism Client macOS (artifact only)` — download
   `Prism.app` from the run’s Artifacts; submit retail builds via Xcode /
   App Store Connect separately. (Windows: `Build Prism Client Windows` is a placeholder until the client app exists.)
5. **Verify —** On the `server/v<version>` draft, confirm DMG, Windows setup,
   portable ZIP, Linux tarball, and the developer source bundle; then **Publish** when ready.

Do **not** merge, tag, or publish without human verification of the draft
artifacts. Git operations stay explicit in chat per repo rules.