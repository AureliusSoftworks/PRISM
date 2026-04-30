param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$PayloadDir,
    [string]$InstallerPath
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..\..")
$WindowsRoot = Join-Path $RepoRoot "apps\server-windows"

if ([string]::IsNullOrWhiteSpace($PayloadDir)) {
    $PayloadDir = Join-Path $WindowsRoot "src\bin\Release\net8.0-windows\win-x64\publish"
}
if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
    $InstallerPath = Join-Path $WindowsRoot "dist\Prism-Server-Setup-v$Version-win-x64.exe"
}

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_SIGNING_CERT_BASE64) -or [string]::IsNullOrWhiteSpace($env:WINDOWS_SIGNING_CERT_PASSWORD)) {
    Write-Warning "Windows signing certificate secrets are not set. Leaving installer unsigned; SmartScreen will warn users."
    return
}

$signtool = (Get-Command signtool.exe -ErrorAction SilentlyContinue)?.Source
if ([string]::IsNullOrWhiteSpace($signtool)) {
    $kits = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue | Sort-Object FullName -Descending
    $signtool = $kits | Select-Object -First 1 -ExpandProperty FullName
}
if ([string]::IsNullOrWhiteSpace($signtool) -or -not (Test-Path $signtool)) {
    throw "signtool.exe was not found. Install the Windows SDK."
}

$certPath = Join-Path $env:TEMP "prism-windows-signing.pfx"
[Convert]::FromBase64String($env:WINDOWS_SIGNING_CERT_BASE64) | Set-Content -Path $certPath -AsByteStream

$targets = @(
    (Join-Path $PayloadDir "Prism Server.exe"),
    $InstallerPath
) | Where-Object { Test-Path $_ }

foreach ($target in $targets) {
    & $signtool sign /f $certPath /p $env:WINDOWS_SIGNING_CERT_PASSWORD /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $target
}

Remove-Item $certPath -Force
