param(
    [Parameter(Position = 0)]
    [string]$Command = "help"
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

Notes:
  windows-server is Windows-only and runs the WPF tray app from source.
  web runs the Next.js dev server on http://localhost:18788.
"@
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
        npm run dev:web
        break
    }
    default {
        Show-Usage
        if ($Command -notin @("help", "-h", "--help")) { exit 64 }
    }
}
