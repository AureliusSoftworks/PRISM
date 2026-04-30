param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$PayloadDir,
    [string]$InnoCompiler
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..\..")
$WindowsRoot = Join-Path $RepoRoot "apps\server-windows"

if ([string]::IsNullOrWhiteSpace($PayloadDir)) {
    $PayloadDir = Join-Path $WindowsRoot "src\bin\Release\net8.0-windows\win-x64\publish"
}
if (-not (Test-Path (Join-Path $PayloadDir "Prism Server.exe"))) {
    throw "Missing Prism Server.exe in payload directory: $PayloadDir"
}

if ([string]::IsNullOrWhiteSpace($InnoCompiler)) {
    $InnoCompiler = (Get-Command iscc.exe -ErrorAction SilentlyContinue)?.Source
}
if ([string]::IsNullOrWhiteSpace($InnoCompiler) -or -not (Test-Path $InnoCompiler)) {
    $default = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    if (Test-Path $default) { $InnoCompiler = $default }
}
if ([string]::IsNullOrWhiteSpace($InnoCompiler) -or -not (Test-Path $InnoCompiler)) {
    throw "Inno Setup Compiler (ISCC.exe) was not found. Install Inno Setup 6 or pass -InnoCompiler."
}

$env:PRISM_SERVER_VERSION = $Version
$env:PRISM_SERVER_PAYLOAD_DIR = $PayloadDir
New-Item -ItemType Directory -Force -Path (Join-Path $WindowsRoot "dist") | Out-Null
& $InnoCompiler (Join-Path $WindowsRoot "installer\PrismServer.iss")
