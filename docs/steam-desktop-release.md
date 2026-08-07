# Prism Desktop Steam Release Lane

This runbook exports already-built Prism Desktop artifacts into Steam depot
content and (optionally) uploads with `steamcmd`.

For the wishlist / store feature-trailer beat sheet and capture checklist, see
[`steam-trailer-wireframe.md`](steam-trailer-wireframe.md).

## Required precondition

Before any Steam upload:

1. Build desktop artifacts (`dist-desktop`) for macOS, Windows, Linux.
2. Confirm Steam-ready artifacts exist:
   - `Prism-Desktop-v<version>-steam-macos.zip` with `PRISM.app` at the archive root
   - `Prism-Desktop-v<version>-steam-win-x64.zip` with `prism_desktop.exe` at the archive root
   - `Prism-Desktop-v<version>-linux-x64.AppImage`
3. Manually smoke-test each artifact.
4. Confirm the exact version to publish.
5. Confirm each platform packaging job passed `npm run steam:content:verify`.
6. Confirm `npm run voice:assets:verify:release` passes. Voice+ is fail-closed
   until the pinned Q4 model, runtime, checksums, provenance watermark, and
   latency qualification are recorded for macOS arm64/x64, Windows x64, and
   Linux x64.

## Marketplace content firewall

Release packaging uses `steam-marketplace-allowlist.json` as a fail-closed
Marketplace roster. `branchLock: "dev"` entries remain available to local dev
builds but are never copied into Steam-safe runtime staging. Adding a new
non-dev Marketplace bot without updating the allowlist fails packaging.

Every staged Steam runtime includes `STEAM_CONTENT_REPORT.md`. Before release,
review that report alongside the asset-rights ledger; the allowlist enforces the
approved roster but does not itself establish copyright, trademark, publicity,
or generated-asset rights.

## Steam Content Survey — voice disclosure

Keep the live-generated AI disclosure explicit about both kinds of local audio:

- PRISM generates bot speech locally at runtime from dialogue chosen or
  generated during play. Packaged models run offline and do not upload spoken
  text or reference material.
- PRISM includes pre-generated or procedural reaction audio such as laughs,
  sighs, gasps, coughs, and breaths. These are original generic voice
  archetypes, not intentional real-person or actor replicas.
- Player-imported reference voices require consent and ownership attestation,
  remain encrypted and local, are excluded from exports and Marketplace
  uploads, and can be deleted completely.
- PRISM prohibits intentional celebrity, historical-recording, actor, or other
  recognizable real-person imitation in its shipped voice system. Marketplace
  persona and publicity-rights review remains a separate release gate.

## Local export

```bash
node scripts/steam/export-desktop-depots.mjs \
  --version 0.2.0 \
  --app-id 123456 \
  --windows-depot-id 123457 \
  --mac-depot-id 123458 \
  --linux-depot-id 123459 \
  --branch prerelease \
  --artifacts-dir dist-desktop \
  --output-dir steam-build
```

Generated output:

- `steam-build/content/*` (per-OS depot payloads)
- `steam-build/scripts/app_build_<appid>.vdf`
- `steam-build/scripts/depot_build_<depotid>.vdf`

Expected Steam launch options:

- Windows: `prism_desktop.exe`
- macOS: `PRISM.app`
- Linux + SteamOS: `Prism-Desktop-v<version>-linux-x64.AppImage`

## Local upload (optional)

```bash
export STEAM_BUILDER_USERNAME="..."
export STEAM_BUILDER_PASSWORD="..."
bash scripts/steam/run-steam-build.sh 123456 steam-build
```

## CI workflow gate

Workflow: `.github/workflows/release-desktop-steam.yml`

Hard gates:

- desktop artifact packaging verifies the fail-closed Marketplace roster on
  macOS, Windows, and Linux
- requires `smoke_test_confirmation=YES`
- defaults to export-only
- upload runs only when `publish_to_steam=true`
- requires `STEAM_BUILDER_USERNAME` and `STEAM_BUILDER_PASSWORD` secrets
