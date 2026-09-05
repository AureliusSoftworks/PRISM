param(
    [string]$NodeVersion = "22.22.2",
    [string]$OutputDir
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $ScriptDir "..\src\Resources\node"
}

$BuildDir = Join-Path $ScriptDir "..\build\node-vendor"
$ZipName = "node-v$NodeVersion-win-x64.zip"
$ExpectedSha256 = "7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c"
$BaseUrl = "https://nodejs.org/dist/v$NodeVersion"
$ZipPath = Join-Path $BuildDir $ZipName

if ($NodeVersion -ne "22.22.2") {
    throw "Node runtime version must match scripts/node-runtime-manifest.json (22.22.2)."
}

if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $BuildDir, $OutputDir | Out-Null

Invoke-WebRequest -Uri "$BaseUrl/$ZipName" -OutFile $ZipPath
$ActualSha256 = (Get-FileHash -Algorithm SHA256 -Path $ZipPath).Hash.ToLowerInvariant()
if ($ActualSha256 -ne $ExpectedSha256) {
    throw "Node.js archive checksum mismatch: expected $ExpectedSha256, got $ActualSha256."
}
Expand-Archive -Path $ZipPath -DestinationPath $BuildDir -Force
$Extracted = Join-Path $BuildDir "node-v$NodeVersion-win-x64"

Copy-Item (Join-Path $Extracted "node.exe") (Join-Path $OutputDir "node.exe") -Force
Copy-Item (Join-Path $Extracted "LICENSE") (Join-Path $OutputDir "LICENSE") -Force
Write-Host "Vendored verified Node $NodeVersion at $OutputDir"
