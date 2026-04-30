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
$BaseUrl = "https://nodejs.org/dist/v$NodeVersion"
$ZipPath = Join-Path $BuildDir $ZipName

if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $BuildDir, $OutputDir | Out-Null

Invoke-WebRequest -Uri "$BaseUrl/$ZipName" -OutFile $ZipPath
Expand-Archive -Path $ZipPath -DestinationPath $BuildDir -Force
$Extracted = Join-Path $BuildDir "node-v$NodeVersion-win-x64"

Copy-Item (Join-Path $Extracted "node.exe") (Join-Path $OutputDir "node.exe") -Force
Copy-Item (Join-Path $Extracted "node_modules") (Join-Path $OutputDir "node_modules") -Recurse -Force
Copy-Item (Join-Path $Extracted "LICENSE") (Join-Path $OutputDir "LICENSE") -Force
Write-Host "Vendored Node $NodeVersion at $OutputDir"
