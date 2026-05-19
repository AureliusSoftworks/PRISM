param(
    [Parameter(Position = 0)]
    [string]$Command = "help",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments = @()
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $RepoRoot

function Show-Usage {
    Write-Host @"
Usage:
  .\scripts\prism.ps1 windows-server
  .\scripts\prism.ps1 up
  .\scripts\prism.ps1 down
  .\scripts\prism.ps1 standalone
  .\scripts\prism.ps1 standalone-win <version> [release-channel]
  .\scripts\prism.ps1 reset [--force]

Notes:
  windows-server is Windows-only and runs the WPF tray app from source.
  up runs the combined dev launcher and starts both API
  (http://localhost:18787) and web (http://localhost:18788).
  down stops local dev processes listening on ports 18787 and 18788.
  standalone runs the desktop standalone launcher (npm run desktop).
  standalone-win dispatches the desktop release workflow and opens the
  desktop/v<version> release page in the browser.
  reset removes local Prism account/data state (factory reset) while
  intentionally keeping launcher configuration files.
"@
}

function Show-ResetWarning {
    Write-Host @"
WARNING: prism reset will permanently delete local Prism data:
  - SQLite database files (localai.db, WAL, SHM)
  - generated-images directories
  - local Qdrant storage directories
  - Prism app runtime logs/cache directories

This keeps launcher configuration files (for example .env) in place.
"@
}

function Confirm-Reset {
    Show-ResetWarning
    $confirmation = Read-Host "`nType RESET to continue"
    if ($confirmation -ne "RESET") {
        Write-Host "Reset cancelled."
        exit 0
    }
}

function Stop-ResetProcesses {
    foreach ($port in @(18787, 18788, 18789, 18790, 6333)) {
        try {
            Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique |
                ForEach-Object {
                    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
                }
        } catch {
            # Some environments do not expose Get-NetTCPConnection state details.
        }
    }

    Get-Process -Name "Prism Server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name "Prism Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name "Prism" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Remove-ResetPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        Write-Host "Removed: $Label"
    } else {
        Write-Host "Missing (skipped): $Label"
    }
}

function Invoke-Reset {
    $isForce = $Arguments -contains "--force"
    $invalidArgs = @($Arguments | Where-Object { $_ -ne "--force" })
    if ($invalidArgs.Count -gt 0) {
        throw "Unknown reset flag(s): $($invalidArgs -join ', '). Usage: .\scripts\prism.ps1 reset [--force]"
    }

    if (-not $isForce) {
        Confirm-Reset
    }

    Stop-ResetProcesses

    $repoDataDir = Join-Path $RepoRoot "apps/api/data"
    $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
    $prismRoot = Join-Path $localAppData "Prism"
    $desktopRoot = Join-Path $localAppData "com.localai.prism-desktop"
    $runtimePrismRoot = Join-Path $localAppData "Programs/Prism"
    $localaiDataDir = if ($env:LOCALAI_DATA_DIR) { $env:LOCALAI_DATA_DIR } else { $null }

    Remove-ResetPath -Path (Join-Path $repoDataDir "localai.db") -Label "repo dev DB (apps/api/data/localai.db)"
    Remove-ResetPath -Path (Join-Path $repoDataDir "localai.db-wal") -Label "repo dev DB WAL (apps/api/data/localai.db-wal)"
    Remove-ResetPath -Path (Join-Path $repoDataDir "localai.db-shm") -Label "repo dev DB SHM (apps/api/data/localai.db-shm)"
    Remove-ResetPath -Path (Join-Path $repoDataDir "generated-images") -Label "repo generated images (apps/api/data/generated-images)"

    if ($null -ne $localaiDataDir -and $localaiDataDir.Trim().Length -gt 0) {
        Remove-ResetPath -Path (Join-Path $localaiDataDir "localai.db") -Label "LOCALAI_DATA_DIR DB ($localaiDataDir\localai.db)"
        Remove-ResetPath -Path (Join-Path $localaiDataDir "localai.db-wal") -Label "LOCALAI_DATA_DIR DB WAL ($localaiDataDir\localai.db-wal)"
        Remove-ResetPath -Path (Join-Path $localaiDataDir "localai.db-shm") -Label "LOCALAI_DATA_DIR DB SHM ($localaiDataDir\localai.db-shm)"
        Remove-ResetPath -Path (Join-Path $localaiDataDir "generated-images") -Label "LOCALAI_DATA_DIR generated images ($localaiDataDir\generated-images)"
    }

    Remove-ResetPath -Path (Join-Path $prismRoot "Data") -Label "windows server data (%LOCALAPPDATA%\Prism\Data)"
    Remove-ResetPath -Path (Join-Path $prismRoot "Qdrant\storage") -Label "windows server qdrant storage (%LOCALAPPDATA%\Prism\Qdrant\storage)"
    Remove-ResetPath -Path (Join-Path $prismRoot "Logs") -Label "windows server logs (%LOCALAPPDATA%\Prism\Logs)"
    Remove-ResetPath -Path (Join-Path $prismRoot "WebView2") -Label "windows server webview cache (%LOCALAPPDATA%\Prism\WebView2)"

    Remove-ResetPath -Path $desktopRoot -Label "desktop app data (%LOCALAPPDATA%\com.localai.prism-desktop)"
    Remove-ResetPath -Path (Join-Path $runtimePrismRoot "user-data") -Label "desktop runtime user data (%LOCALAPPDATA%\Programs\Prism\user-data)"

    Write-Host ""
    Write-Host "Factory reset complete."
    Write-Host "Kept intentionally: launcher configuration files (for example .env files)."
}

function Ensure-GhReady {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "Install GitHub CLI first, then run: gh auth login"
    }
    gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI is not authenticated. Run: gh auth login"
    }
}

function Invoke-StandaloneWin {
    $version = if ($Arguments.Count -ge 1) { $Arguments[0] } else { "" }
    $releaseChannel = if ($Arguments.Count -ge 2) { $Arguments[1] } else { "" }
    $releaseRef = if ($env:PRISM_RELEASE_REF) { $env:PRISM_RELEASE_REF } else { "main" }
    $includeReleaseChannel = -not [string]::IsNullOrWhiteSpace($releaseChannel)
    $includeLegacyTestflight = $false

    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "Usage: .\scripts\prism.ps1 standalone-win <version> [release-channel]"
    }
    if ($version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
        throw "Version must follow SemVer core format (example: 0.2.0)."
    }

    Ensure-GhReady

    Write-Host "Dispatching release-main.yml on ref '$releaseRef' for Prism Desktop v$version..."
    $dispatchOk = $false
    $dispatchError = ""
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $dispatchArgs = @("workflow", "run", "release-main.yml", "--ref", $releaseRef, "-f", "version=$version")
        if ($includeReleaseChannel) {
            $dispatchArgs += @("-f", "desktop_release_channel=$releaseChannel")
        }
        if ($includeLegacyTestflight) {
            $dispatchArgs += @("-f", "client_testflight_build=false")
        }

        try {
            $dispatchOutput = & gh @dispatchArgs 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dispatchOk = $true
                break
            }
            $dispatchError = ($dispatchOutput | Out-String)
        } catch {
            $dispatchError = $_.Exception.Message
        }

        if ($includeReleaseChannel -and $dispatchError -like '*Unexpected inputs provided: ["desktop_release_channel"]*') {
            $includeReleaseChannel = $false
            continue
        }
        if (-not $includeLegacyTestflight -and $dispatchError -like "*Required input 'client_testflight_build' not provided*") {
            $includeLegacyTestflight = $true
            continue
        }

        break
    }

    if (-not $dispatchOk) {
        throw "Failed to dispatch release-main.yml. $dispatchError"
    }

    $repoFullName = gh repo view --json nameWithOwner --jq .nameWithOwner
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoFullName)) {
        throw "Workflow dispatched, but failed to resolve GitHub repository name."
    }

    $releaseUrl = "https://github.com/$repoFullName/releases/tag/desktop%2Fv$version"
    $actionsUrl = "https://github.com/$repoFullName/actions/workflows/release-main.yml"
    $targetUrl = $releaseUrl

    gh release view "desktop/v$version" *> $null
    if ($LASTEXITCODE -ne 0) {
        $targetUrl = $actionsUrl
    }

    Write-Host ""
    Write-Host "Windows build dispatched."
    Write-Host "Workflow runs: $actionsUrl"
    Write-Host "Desktop release page: $releaseUrl"
    if ($targetUrl -ne $releaseUrl) {
        Write-Host "Desktop tag not available yet on this workflow contract; opening workflow runs instead."
    }
    Start-Process $targetUrl
}

switch ($Command.ToLowerInvariant()) {
    { $_ -in @("windows-server", "server-windows", "server") } {
        $isWindowsHost = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
        if (-not $isWindowsHost) {
            throw "Prism Server for Windows can only run on Windows. Use the GitHub release workflow to build the installer from macOS."
        }
        Get-Process -Name "Prism Server" -ErrorAction SilentlyContinue | Stop-Process -Force
        dotnet run --project apps/server-windows/src/PrismServer.csproj -c Debug
        break
    }
    { $_ -in @("up", "web") } {
        npm run dev
        break
    }
    "down" {
        foreach ($port in @(18787, 18788)) {
            try {
                Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                    Select-Object -ExpandProperty OwningProcess -Unique |
                    ForEach-Object {
                        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
                    }
            } catch {
                # Some environments do not expose Get-NetTCPConnection state details.
            }
        }
        Write-Host "Prism web stack stopped (ports 18787 and 18788 are now free)."
        break
    }
    { $_ -in @("standalone", "desktop") } {
        npm run desktop
        break
    }
    { $_ -in @("standalone-win", "desktop-win") } {
        Invoke-StandaloneWin
        break
    }
    "reset" {
        Invoke-Reset
        break
    }
    default {
        Show-Usage
        if ($Command -notin @("help", "-h", "--help")) { exit 64 }
    }
}
