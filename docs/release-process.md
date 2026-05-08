# Prism Release Process

This runbook defines the production release flow for Prism:

- `dev` is the integration branch.
- `main` is release-only.
- Release automation runs from `main` and produces:
  - `Prism Server` GitHub Release (the canonical end-user download lane for
    Mac DMG, Windows installer + portable ZIP, and Linux tarball).
  - `Prism Client` GitHub Release (the canonical end-user download lane for
    desktop client binaries; iOS users do not download anything because the
    iPhone experience is a PWA served by Prism Server).

For the product positioning that this runbook implements (indie /
Patreon / direct download / iOS-via-PWA / JetBrains-style licensing), see
[distribution-model.md](distribution-model.md). When this runbook and the
distribution model disagree, the distribution model wins.

## Release Channel Semantics

To avoid ambiguity:

- GitHub **draft** releases are unpublished and used as a staging slot while
  per-platform binaries upload. Once all expected assets are present and the
  operator has spot-checked them, the draft is **published** directly. There
  is no separate App Store / TestFlight review step in this model.
- GitHub published releases in this public repository are publicly downloadable
  by anyone with the URL; **purchase gating happens at pairing time** via the
  client's license code, not at the download URL. See
  [distribution-model.md](distribution-model.md) for the licensing details.

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
- `client_testflight_build`: legacy input, kept temporarily so existing
  workflow YAML still validates. Under the indie distribution model this field
  is not used downstream; pass any non-empty placeholder string (for example
  the version itself, e.g. `0.2.0`). A follow-up will remove this input from
  the workflow schema entirely.

Validation guards:

- `version` must match semantic-version core format (`x.y.z`)
- `CHANGELOG.md` must contain `## [<version>]` before release creation

Output lanes:

1. **Server lane**
  - Tag: `server/v<version>`
  - GitHub draft release: `Prism Server v<version>` (published once all assets
    are uploaded and spot-checked)
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
  - GitHub draft release: `Prism Client v<version>` (published alongside the
    server release once client binaries are uploaded and spot-checked)
  - Assets:
    - `Prism-v<version>.dmg` for the macOS desktop client (Developer ID
      signed + notarized; signing workflow is a follow-up).
    - Windows and Linux desktop-client binaries when those scaffolds exist
      (out of scope today).
    - **No iOS asset.** The iPhone experience is a Progressive Web App served
      by Prism Server itself; users open the server URL in Safari and
      "Add to Home Screen". See [prism-ios-client.md](prism-ios-client.md).

## Publish Decision

Both the server and the client release can be published once:

- deployment / smoke-test checks pass on a fresh install of each binary
- the release notes have been reviewed
- a license code (when the license-issuing pipeline exists) successfully
  pairs a client against a freshly installed server

There is no separate App Review or TestFlight gate. "Publish" is an operator
judgment call, not an external approval step. After publishing, post the
download links to the patron-only Patreon update for the release.

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

## Native client builds

Under the indie distribution model, retail **Prism Client** binaries are
**first-class GitHub Release assets** on the `client/v<version>` release, not
App Store / TestFlight uploads.

Today the wiring is partially complete; the table below is the target state:

| Platform | Workflow | Target asset | Status |
|---|---|---|---|
| macOS | `.github/workflows/build-client-mac.yml` | `Prism-v<version>.dmg` (Developer ID signed + notarized) | Builds, signs, notarizes, and uploads `Prism-v<version>.dmg` to the `client/v<version>` GitHub Release; runs `stapler validate` and `spctl --assess` as a Gatekeeper smoke check before upload. End-to-end verification on a clean Mac happens the first time the workflow runs against a real release. |
| Windows | `.github/workflows/build-client-windows.yml` | `Prism-Setup-v<version>-win-x64.exe` and `Prism-v<version>-win-x64-portable.zip` | Placeholder until `apps/client-windows/` is scaffolded. Windows desktop client is a future-roadmap target, not a current ship lane. |
| Linux | None yet | `Prism-v<version>-linux-x64.tar.gz` (or AppImage) | Future scaffold. |
| iOS | None (PWA) | No binary. Users open the server URL in Safari and "Add to Home Screen". | Live today; see [prism-ios-client.md](prism-ios-client.md). |

The native iOS Xcode project at `apps/ios-client/` is **deprecated** under
this model and is no longer the iOS distribution path. It is kept for archive
only; see the deprecation banner in
[prism-ios-client.md](prism-ios-client.md).

## /🏗️ build — operator quick checklist

Use this order on **`main`** after merging `dev` (and with `CHANGELOG.md`
already listing `## [<version>]`):

1. **Preflight —** Run `npm run typecheck` and `npm run lint` locally or rely on CI.
2. **Draft releases —** Actions → **Release Pipeline (dev -> main)** → Run workflow:
   `version`, `client_testflight_build` (legacy input — pass any non-empty
   placeholder string, e.g. the version number).
   *Or* use **Release Prism Server (all platforms)** to create the same drafts **and**
   build every server artifact in one run (optional Mac client artifact at the end).
3. **Server binaries —** If you used **Release Pipeline** only, run in any order (each requires the `server/v<version>` draft):
   - `Release Prism Server macOS App`
   - `Release Prism Server Windows App`
   - `Release Prism Server Linux bundle`
4. **Client binary (Mac) —** `Release Prism Client macOS App` — builds, signs,
   notarizes, and uploads `Prism-v<version>.dmg` to the `client/v<version>`
   GitHub Release. The first run against a real release also doubles as the
   end-to-end verification gate; spot-check that the DMG opens cleanly and
   `Prism.app` launches without Gatekeeper warnings before publishing.
   (Windows / Linux client workflows are placeholders until those scaffolds
   exist.)
5. **Verify, publish, then post —**
   - On the `server/v<version>` draft, confirm DMG, Windows setup, portable
     ZIP, Linux tarball, and the developer source bundle.
   - On the `client/v<version>` draft, confirm the Mac client asset is present
     and installs cleanly.
   - **Publish** both releases.
   - Post the published download links and any newly issued license codes to
     the patron-only Patreon update for this release.

Do **not** merge, tag, or publish without human verification of the draft
artifacts. Git operations stay explicit in chat per repo rules. There is no
external review step (no App Review, no TestFlight) — publish is operator
judgment.