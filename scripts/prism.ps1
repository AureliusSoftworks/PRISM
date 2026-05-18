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
  .\scripts\prism.ps1 web
  .\scripts\prism.ps1 standalone
  .\scripts\prism.ps1 reset [--force]

Notes:
  windows-server is Windows-only and runs the WPF tray app from source.
  web runs the combined dev launcher and starts both API
  (http://localhost:18787) and web (http://localhost:18788).
  standalone runs the desktop standalone launcher (`npm run desktop`).
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
    "web" {
        npm run dev
        break
    }
    { $_ -in @("standalone", "desktop") } {
        npm run desktop
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
