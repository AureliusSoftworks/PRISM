# Prism Desktop Steam Release Lane

This runbook exports already-built Prism Desktop artifacts into Steam depot
content and (optionally) uploads with `steamcmd`.

## Required precondition

Before any Steam upload:

1. Build desktop artifacts (`dist-desktop`) for macOS, Windows, Linux.
2. Confirm Steam-ready artifacts exist:
   - `Prism-Desktop-v<version>-steam-macos.zip` with `PRISM.app` at the archive root
   - `Prism-Desktop-v<version>-steam-win-x64.zip` with `prism_desktop.exe` at the archive root
   - `Prism-Desktop-v<version>-linux-x64.AppImage`
3. Manually smoke-test each artifact.
4. Confirm the exact version to publish.

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

- requires `smoke_test_confirmation=YES`
- defaults to export-only
- upload runs only when `publish_to_steam=true`
- requires `STEAM_BUILDER_USERNAME` and `STEAM_BUILDER_PASSWORD` secrets
