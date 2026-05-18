param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DistDir = Join-Path $RepoRoot "dist-desktop"

Push-Location $RepoRoot
try {
    Write-Host "Staging desktop runtime..."
    npm run desktop:stage-runtime

    Write-Host "Building Tauri Windows bundle..."
    npm run build -w apps/desktop

    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

    $msiSource = Get-ChildItem -Path "apps\desktop\src-tauri\target\release\bundle\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
    $nsisSource = Get-ChildItem -Path "apps\desktop\src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

    if ($msiSource) {
        $msiTarget = Join-Path $DistDir "Prism-Desktop-Setup-v$Version-win-x64.msi"
        Copy-Item $msiSource.FullName $msiTarget -Force
        Write-Host "Wrote $msiTarget"
    }

    if ($nsisSource) {
        $exeTarget = Join-Path $DistDir "Prism-Desktop-Setup-v$Version-win-x64.exe"
        Copy-Item $nsisSource.FullName $exeTarget -Force
        Write-Host "Wrote $exeTarget"
    }

    if (-not $msiSource -and -not $nsisSource) {
        throw "Could not find generated Windows installers under apps\desktop\src-tauri\target\release\bundle."
    }

    if ($env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT) {
        if (-not (Test-Path $env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT)) {
            throw "PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT points to a missing path: $($env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT)"
        }

        $artifacts = @()
        if ($msiSource) { $artifacts += (Join-Path $DistDir "Prism-Desktop-Setup-v$Version-win-x64.msi") }
        if ($nsisSource) { $artifacts += (Join-Path $DistDir "Prism-Desktop-Setup-v$Version-win-x64.exe") }

        foreach ($artifact in $artifacts) {
            & $env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT $artifact $Version
        }
    }
}
finally {
    Pop-Location
}
