param(
    [int[]]$Ports = @(18787, 18788, 18789, 18790)
)

$ErrorActionPreference = "SilentlyContinue"

$processes = @(Get-CimInstance Win32_Process)
$byId = @{}
foreach ($process in $processes) {
    $byId[[int]$process.ProcessId] = $process
}

$protected = [System.Collections.Generic.HashSet[int]]::new()
$current = $byId[[int]$PID]
while ($null -ne $current) {
    [void]$protected.Add([int]$current.ProcessId)
    $parentId = [int]$current.ParentProcessId
    if (-not $byId.ContainsKey($parentId)) {
        break
    }
    $current = $byId[$parentId]
}

$roots = [System.Collections.Generic.HashSet[int]]::new()

function Add-Root {
    param([int]$ProcessId)

    if ($ProcessId -le 0) {
        return
    }
    if ($protected.Contains($ProcessId)) {
        return
    }
    [void]$roots.Add($ProcessId)
}

function Add-PortRoot {
    param([int]$ProcessId)

    Add-Root -ProcessId $ProcessId

    $current = $byId[$ProcessId]
    while ($null -ne $current) {
        $parentId = [int]$current.ParentProcessId
        if (-not $byId.ContainsKey($parentId)) {
            break
        }

        $parent = $byId[$parentId]
        $parentCommandLine = [string]$parent.CommandLine
        if ($parentCommandLine -notmatch "--watch\b.*src[\\/]+server\.ts") {
            break
        }

        Add-Root -ProcessId ([int]$parent.ProcessId)
        $current = $parent
    }
}

try {
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $Ports -contains $_.LocalPort } |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Add-PortRoot -ProcessId ([int]$_) }
} catch {
    # Older Windows environments may not expose Get-NetTCPConnection.
}

$patterns = @(
    "scripts[\\/]+dev\.mjs",
    "apps[\\/]+api[\\/]+src[\\/]+server\.ts",
    "next(\.cmd)?\s+dev\b.*\s-p\s+1878[89]\b",
    "\.next[\\/]+standalone[\\/]+apps[\\/]+web[\\/]+server\.js",
    "windows-dev-api\.cmd",
    "\\PRISM\\start\.bat"
)

foreach ($process in $processes) {
    $commandLine = [string]$process.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) {
        continue
    }

    foreach ($pattern in $patterns) {
        if ($commandLine -match $pattern) {
            Add-Root -ProcessId ([int]$process.ProcessId)
            break
        }
    }
}

if ($roots.Count -eq 0) {
    Write-Host "No stale Prism processes found."
    exit 0
}

foreach ($processId in @($roots)) {
    & taskkill.exe /F /T /PID $processId *> $null
}

Start-Sleep -Milliseconds 750
Write-Host "Stopped stale Prism process tree(s): $(@($roots) -join ', ')"
