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
    Write-Host "Building Prism server runtime..."
    npm run build

    if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

    Write-Host "Staging API runtime..."
    New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir "apps\api") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir "apps\web\.next") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir "node_modules\@localai") | Out-Null

    $apiDistSource = Join-Path $RepoRoot "apps\api\dist"
    $nestedApiEntry = Join-Path $RepoRoot "apps\api\dist\apps\api\src\server.js"
    if (Test-Path $nestedApiEntry) {
        $apiDistSource = Join-Path $RepoRoot "apps\api\dist\apps\api\src"
    }

    Copy-Item $apiDistSource (Join-Path $OutputDir "apps\api\dist") -Recurse -Force
    if (-not (Test-Path (Join-Path $OutputDir "apps\api\dist\server.js"))) {
        throw "Missing staged API entrypoint: $OutputDir\apps\api\dist\server.js"
    }

    Copy-Item (Join-Path $RepoRoot "apps\api\package.json") (Join-Path $OutputDir "apps\api\package.json") -Force
    Copy-Item (Join-Path $RepoRoot "package.json") (Join-Path $OutputDir "package.json") -Force
    Copy-Item (Join-Path $RepoRoot "package-lock.json") (Join-Path $OutputDir "package-lock.json") -Force

    Write-Host "Staging API production dependencies..."
    Copy-Item (Join-Path $RepoRoot "packages\config") (Join-Path $OutputDir "node_modules\@localai\config") -Recurse -Force
    Copy-Item (Join-Path $RepoRoot "packages\shared") (Join-Path $OutputDir "node_modules\@localai\shared") -Recurse -Force
    Copy-Item (Join-Path $RepoRoot "node_modules\dnssd-advertise") (Join-Path $OutputDir "node_modules\dnssd-advertise") -Recurse -Force

    Write-Host "Staging Next.js standalone runtime..."
    Copy-Item (Join-Path $RepoRoot "apps\web\.next\standalone") (Join-Path $OutputDir "apps\web\.next\standalone") -Recurse -Force
    New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir "apps\web\.next\standalone\apps\web\.next") | Out-Null
    Copy-Item (Join-Path $RepoRoot "apps\web\.next\static") (Join-Path $OutputDir "apps\web\.next\standalone\apps\web\.next\static") -Recurse -Force
    $publicDir = Join-Path $RepoRoot "apps\web\public"
    if (Test-Path $publicDir) {
        Copy-Item $publicDir (Join-Path $OutputDir "apps\web\.next\standalone\apps\web\public") -Recurse -Force
    }

    Write-Host "Runtime staged at $OutputDir"

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
