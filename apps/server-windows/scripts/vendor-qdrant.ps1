param(
    [string]$QdrantVersion = "1.17.1",
    [string]$OutputDir
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $ScriptDir "..\src\Resources\qdrant"
}

$BuildDir = Join-Path $ScriptDir "..\build\qdrant-vendor"
$ZipName = "qdrant-x86_64-pc-windows-msvc.zip"
$BaseUrl = "https://github.com/qdrant/qdrant/releases/download/v$QdrantVersion"
$ZipPath = Join-Path $BuildDir $ZipName

if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $BuildDir, $OutputDir | Out-Null

Invoke-WebRequest -Uri "$BaseUrl/$ZipName" -OutFile $ZipPath
Expand-Archive -Path $ZipPath -DestinationPath $BuildDir -Force
$qdrant = Get-ChildItem -Path $BuildDir -Recurse -Filter qdrant.exe | Select-Object -First 1
if ($null -eq $qdrant) {
    throw "Could not locate qdrant.exe in $ZipName"
}

Copy-Item $qdrant.FullName (Join-Path $OutputDir "qdrant.exe") -Force
Write-Host "Vendored Qdrant $QdrantVersion at $OutputDir"
