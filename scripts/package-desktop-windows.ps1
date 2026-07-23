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
    $steamExeSource = "apps\desktop\src-tauri\target\release\prism_desktop.exe"
    $steamStageDir = Join-Path $DistDir "steam-windows"
    $steamZipTarget = Join-Path $DistDir "Prism-Desktop-v$Version-steam-win-x64.zip"

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

    if (-not (Test-Path $steamExeSource)) {
        throw "Could not find generated Windows Steam executable at $steamExeSource."
    }

    if (Test-Path $steamStageDir) {
        Remove-Item -Recurse -Force $steamStageDir
    }
    New-Item -ItemType Directory -Force -Path $steamStageDir | Out-Null

    $steamExeTarget = Join-Path $steamStageDir "prism_desktop.exe"
    Copy-Item $steamExeSource $steamExeTarget -Force

    $resourceSource = "apps\desktop\src-tauri\target\release\resources"
    if (Test-Path $resourceSource) {
        Copy-Item $resourceSource (Join-Path $steamStageDir "resources") -Recurse -Force
    }

    Get-ChildItem -Path "apps\desktop\src-tauri\target\release" -Filter "*.dll" -File -ErrorAction SilentlyContinue |
        ForEach-Object {
            Copy-Item $_.FullName (Join-Path $steamStageDir $_.Name) -Force
        }

    if ($env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT) {
        if (-not (Test-Path $env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT)) {
            throw "PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT points to a missing path: $($env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT)"
        }

        $artifacts = @()
        if ($msiSource) { $artifacts += (Join-Path $DistDir "Prism-Desktop-Setup-v$Version-win-x64.msi") }
        if ($nsisSource) { $artifacts += (Join-Path $DistDir "Prism-Desktop-Setup-v$Version-win-x64.exe") }
        $artifacts += $steamExeTarget

        foreach ($artifact in $artifacts) {
            & $env:PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT $artifact $Version
        }
    }

    if (Test-Path $steamZipTarget) {
        Remove-Item -Force $steamZipTarget
    }
    Compress-Archive -Path (Join-Path $steamStageDir "*") -DestinationPath $steamZipTarget -Force
    Write-Host "Wrote $steamZipTarget"
}
finally {
    Pop-Location
}
