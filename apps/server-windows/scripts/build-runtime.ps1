param(
    [string]$OutputDir,
    [switch]$VendorNode,
    [switch]$VendorQdrant
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..\..")

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $RepoRoot "apps\server-windows\src\bin\Release\net8.0-windows\win-x64\publish\runtime"
}

$OutputDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir)
$PayloadRoot = Split-Path -Parent $OutputDir

Push-Location $RepoRoot
try {
    Write-Host "Staging Prism runtime with shared script..."
    node (Join-Path $RepoRoot "scripts\stage-desktop-runtime.mjs") --output-dir $OutputDir

    $nodeOutputDir = Join-Path $PayloadRoot "node"
    if ($VendorNode) {
        & (Join-Path $ScriptDir "vendor-node.ps1") -OutputDir $nodeOutputDir
    } elseif (Test-Path (Join-Path $RepoRoot "apps\server-windows\src\Resources\node\node.exe")) {
        if (Test-Path $nodeOutputDir) { Remove-Item $nodeOutputDir -Recurse -Force }
        Copy-Item (Join-Path $RepoRoot "apps\server-windows\src\Resources\node") $nodeOutputDir -Recurse -Force
    } else {
        Write-Host "No bundled Node staged; Prism Server.exe will use system Node from PATH."
    }

    $qdrantOutputDir = Join-Path $PayloadRoot "qdrant"
    if ($VendorQdrant) {
        & (Join-Path $ScriptDir "vendor-qdrant.ps1") -OutputDir $qdrantOutputDir
    } elseif (Test-Path (Join-Path $RepoRoot "apps\server-windows\src\Resources\qdrant\qdrant.exe")) {
        if (Test-Path $qdrantOutputDir) { Remove-Item $qdrantOutputDir -Recurse -Force }
        Copy-Item (Join-Path $RepoRoot "apps\server-windows\src\Resources\qdrant") $qdrantOutputDir -Recurse -Force
    } else {
        Write-Host "No bundled Qdrant staged; set an external Qdrant URL or run with -VendorQdrant."
    }
}
finally {
    Pop-Location
}
