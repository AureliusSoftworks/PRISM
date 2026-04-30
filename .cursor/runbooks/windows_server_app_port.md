# windows_server_app_port

## Goal
Implement and validate a Windows-native Prism Server app that mirrors the macOS `apps/server-mac` app: a .NET 8 WPF tray-first `Prism Server.exe`, packaged by a per-user Inno Setup wizard that installs the app shell, staged Node runtime, bundled Node, and bundled Qdrant.

## Inputs
- Repo root path on a Windows machine.
- Access to a Windows environment with .NET 8 SDK, Node 22, Git, PowerShell 7, and Inno Setup.
- Optional Windows code-signing secrets:
  - `WINDOWS_SIGNING_CERT_BASE64`
  - `WINDOWS_SIGNING_CERT_PASSWORD`
- A release version such as `0.2.0` when building a distributable installer.

## Preconditions
- Start from the repository root.
- Do not edit `.cursor/plans/windows_server_app_port_9d65b04e.plan.md`.
- Preserve unrelated working-tree changes.
- Do not delete or rewrite the existing `start.bat`; keep it as a legacy/dev fallback.
- Target `win-x64` for v1.
- Do not bundle or chain-install Ollama. The app detects Ollama at first run and uses `ollama pull <model>` only after user action.

## Execution Steps
1. Inspect the current Mac server implementation in `apps/server-mac`.
   - Expected result: the Windows port maps the Mac app's config, readiness, runtime supervision, Qdrant ownership, Ollama checks, logs, and pairing behavior.
2. Scaffold `apps/server-windows/`.
   - Expected result: the folder contains `PrismServer.sln`, `src/PrismServer.csproj`, `tests/PrismServer.Tests.csproj`, `installer/`, `scripts/`, and `.gitignore`.
3. Configure the WPF project for .NET 8.
   - Expected result: `PrismServer.csproj` uses WPF, targets Windows, publishes self-contained `win-x64`, and can reference tray-icon support.
4. Add the tray-first app shell.
   - Expected result: launching the app creates a system tray icon, opens Setup on first launch, hides the window on close, and exits only through Quit.
5. Add single-instance handling.
   - Expected result: a second launch activates the existing app instead of spawning a second runtime supervisor.
6. Port models and path helpers.
   - Expected result: `ServerConfig`, `RuntimeState`, `DependencyStatus`, `QdrantResolution`, `QdrantUrl`, `OllamaUrl`, and `Paths` exist with unit tests for defaults and URL normalization.
7. Port `ConfigStore`.
   - Expected result: settings load/save to `%LOCALAPPDATA%\Prism\.env`, preserve the Mac env keys, and migrate legacy ports to `18787` / `18788`.
8. Port runtime supervision services.
   - Expected result: `RuntimeManager` starts/stops API and web Node processes from the staged `runtime/` directory, logs stdout/stderr to `%LOCALAPPDATA%\Prism\Logs`, and kills child process trees on shutdown.
9. Port Qdrant services.
   - Expected result: `QdrantResolutionService`, `QdrantBinaryResolver`, and `QdrantManager` choose external vs Prism-managed Qdrant, prefer installed `qdrant\qdrant.exe`, store data at `%LOCALAPPDATA%\Prism\Qdrant\storage`, and wait for `/readyz`.
10. Port Ollama, dependency, log, and pairing services.
    - Expected result: the app can detect Ollama, validate/pull a model, read logs, and generate a pairing code through `POST http://127.0.0.1:<apiPort>/api/local/pairing/codes`.
11. Build `AppViewModel`.
    - Expected result: Setup, Logs, and tray menu bind to the same state transitions and commands as the Mac `AppModel`.
12. Build WPF views.
    - Expected result: Setup shows readiness pillars, Start Memory Engine, Download Model, Refresh, Advanced config, and Pair a Client App. Logs shows combined API/Web log tails. The tray menu shows status, Setup, Logs, Start/Stop/Restart, and Quit.
13. Author `scripts/build-runtime.ps1`.
    - Expected result: the script runs the repo build, stages API dist, Next standalone output, static/public assets, local workspace packages, and runtime package metadata beside the published exe.
14. Author `scripts/vendor-node.ps1`.
    - Expected result: with `VENDOR_NODE=1`, the script downloads Node 22 `win-x64` and stages `node\node.exe`.
15. Author `scripts/vendor-qdrant.ps1`.
    - Expected result: with `VENDOR_QDRANT=1`, the script downloads Qdrant `x86_64-pc-windows-msvc` and stages `qdrant\qdrant.exe`.
16. Author `installer/PrismServer.iss`.
    - Expected result: Inno Setup creates a per-user wizard installer with Start Menu shortcut, optional Desktop shortcut, optional Launch on finish, default-on "Start Prism Server when I sign in", standard uninstall entry, and no license click-through.
17. Add uninstall data-retention behavior.
    - Expected result: uninstall always removes install files and auto-start registry entry, but preserves `%LOCALAPPDATA%\Prism\` unless the user checks a default-off wipe-data checkbox.
18. Author `scripts/build-installer.ps1`.
    - Expected result: the script calls `ISCC.exe` and writes `dist\Prism-Server-Setup-v<version>-win-x64.exe`.
19. Author `scripts/sign-and-package.ps1`.
    - Expected result: the script signs `Prism Server.exe` and the installer when signing secrets are present, and skips signing with a clear warning when they are absent.
20. Add `.github/workflows/release-server-windows.yml`.
    - Expected result: a `windows-latest` workflow installs dependencies, publishes the app, stages runtime binaries, builds the Inno installer, signs when possible, and uploads to `server/v<version>`.
21. Add docs and quick-launch support.
    - Expected result: `docs/prism-server-app-windows.md`, README Windows server section, `docs/native-quick-launch.md` Windows notes, and `scripts/prism.ps1 windows-server` are present.

## Validation Steps
1. Run unit tests for the Windows project.
   - Command: `dotnet test apps/server-windows/PrismServer.sln`
   - Expected result: model, config, URL, dependency, and service tests pass.
2. Publish the Windows app payload.
   - Command: `dotnet publish apps/server-windows/src/PrismServer.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true`
   - Expected result: publish output contains `Prism Server.exe`.
3. Stage the runtime with bundled components.
   - Command: `pwsh apps/server-windows/scripts/build-runtime.ps1 -Configuration Release -Runtime win-x64`
   - Expected result: publish output contains `runtime\`, `node\node.exe`, and `qdrant\qdrant.exe`.
4. Build the installer.
   - Command: `pwsh apps/server-windows/scripts/build-installer.ps1 -Version <version>`
   - Expected result: `apps/server-windows/dist/Prism-Server-Setup-v<version>-win-x64.exe` exists.
5. Install on a Windows test machine.
   - Expected result: installer runs without admin by default, installs to `%LOCALAPPDATA%\Programs\Prism Server`, creates the selected shortcuts, and registers auto-start if the default-on checkbox remains checked.
6. Launch `Prism Server.exe`.
   - Expected result: tray icon appears, Setup opens, and the app does not expose an Open Dashboard command.
7. Start or detect Memory Engine.
   - Expected result: Prism-managed Qdrant starts from `qdrant\qdrant.exe`, or an already-running external Qdrant is detected and not killed by Prism.
8. Start the server runtime.
   - Expected result: API listens on `18787`, web listens on `18788`, logs are written under `%LOCALAPPDATA%\Prism\Logs`, and no orphan child processes remain after Quit.
9. Generate a pairing code.
   - Expected result: Setup displays a short pairing code returned by the local API.
10. Test uninstall without data wipe.
    - Expected result: app files and auto-start are removed, `%LOCALAPPDATA%\Prism\` remains, and reinstall preserves settings/data.
11. Test uninstall with data wipe.
    - Expected result: app files, auto-start, and `%LOCALAPPDATA%\Prism\` are removed after explicit opt-in.

## Decision Points
- If WPF cannot be built on the current machine: use `windows-latest` GitHub Actions or a Windows workstation; do not try to launch the WPF UI on macOS.
- If signing secrets are missing: emit an unsigned installer and document SmartScreen warnings.
- If Inno Setup is missing locally: install it on the Windows machine, or rely on the GitHub Actions workflow.
- If Qdrant's Windows asset name changes: verify the latest release asset name before editing `vendor-qdrant.ps1`.
- If `dnssd-advertise` cannot run on Windows: keep the API/web runtime working, document discovery limitation, and preserve manual pairing fallback.
- If the app requires a firewall rule for pairing: do not require admin during install; document the elevated PowerShell rule as a manual fix.

## Error Handling
- Missing Windows machine: stop after cross-platform-safe C# tests and report that installer/UI verification requires Windows.
- Missing Node: install Node 22 before runtime staging.
- Missing Inno Setup: stop installer build and print the expected `ISCC.exe` path.
- Build failure: report the first failing command, the relevant log excerpt, and the file most likely responsible.
- Runtime child exit: surface the failed child name and exit code in app state and logs.
- Port conflict: show which Prism dependency is blocked and recommend stopping the conflicting service or changing Advanced settings.
- Uninstall while app is running: installer should close the app gracefully, then remove files.

## Output Contract
Return this structure after execution:

```markdown
Runbook: windows_server_app_port
Mode: <implementation|validation-only>
Result: <completed|partial|blocked>

Created/Changed:
- <path>: <purpose>

Validation:
- <command or manual test>: <pass/fail/skipped + reason>

Installer Artifact:
- <path or not produced>

Windows Manual Checks:
- <check>: <result or pending>

Known Gaps:
- <gap or "None">

Next Actions:
- <action>
```

## Completion Criteria
- `apps/server-windows/` exists with WPF app, services, tests, scripts, and installer definition.
- Runtime staging produces the same API/web layout the Mac server launches.
- Inno Setup produces `Prism-Server-Setup-v<version>-win-x64.exe`.
- The installed app can start, stop, and restart API/Web/Qdrant without orphaning child processes.
- The app can generate a pairing code.
- Uninstall preserves user data by default and wipes it only with explicit opt-in.
- README, Windows app docs, native quick-launch docs, and release workflow are updated.

## Handoff Notes
- The plan file is a reference only; do not edit it during execution.
- The Mac server remains the source of truth for behavior parity.
- `start.bat` remains a legacy/dev fallback and should not be removed.
- v1 is `win-x64`; defer `win-arm64`.
- Keep the tray menu server-focused: no Open Dashboard entry.
