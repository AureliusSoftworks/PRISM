# Prism Desktop Steam Release Lane

This runbook exports already-built Prism Desktop artifacts into Steam depot
content and (optionally) uploads with `steamcmd`.

For the wishlist / store feature-trailer beat sheet and capture checklist, see
[`steam-trailer-wireframe.md`](steam-trailer-wireframe.md).

For the Steam Content Survey AI wording and human release checkpoint, see
[`steam-ai-content-disclosure.md`](steam-ai-content-disclosure.md).

For the store description, metadata, and screenshot handoff, see
[`steam-store-copy.md`](steam-store-copy.md).

For the platform-by-platform manual launch record, see
[`steam-smoke-matrix.md`](steam-smoke-matrix.md).

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
6. Confirm each platform packaging job passed `npm run steam:assets:verify`.
7. Confirm `npm run voice:assets:verify` passes. Steam ships the qualified
   Instant/Kokoro path by default; Voice+ remains unavailable in the Steam
   build until the pinned Q4 model, runtime, checksums, provenance watermark,
   and latency qualification are recorded for macOS arm64/x64, Windows x64,
   and Linux x64. Use `--require-voice-plus` only for an explicit development
   qualification run.

## Marketplace content firewall

Release packaging uses `steam-marketplace-allowlist.json` as a fail-closed
Marketplace roster. `branchLock: "dev"` entries remain available to local dev
builds but are never copied into Steam-safe runtime staging. The policy's
`steamExcludedBotIds` list provides the same staging boundary for public persona
bots whose rights or provenance review is still pending: they remain available
to development, but are omitted from Steam packaging. Adding a new non-dev
Marketplace bot without updating either policy list fails packaging.

Every staged Steam runtime includes `STEAM_CONTENT_REPORT.md`. Before release,
review that report alongside `steam-asset-rights-ledger.json`. The ledger
hashes every staged image, audio, vector, and font asset, and fails closed when
a media file is added without a rights profile. The allowlist and exclusion
list enforce Marketplace packaging scope but do not themselves establish
copyright, trademark, publicity, or generated-asset rights.

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

The exporter refuses the public `default` branch. Export and upload to a
private or prerelease branch first; promote the default branch manually in
Steamworks only after the build review and platform smoke checks pass.

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
