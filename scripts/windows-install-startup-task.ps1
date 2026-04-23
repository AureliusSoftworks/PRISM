# Creates a Windows scheduled task to start the Prism Docker stack at login.
# Run as Administrator.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath   = Join-Path $scriptDir "windows-startup.bat"

$action  = New-ScheduledTaskAction -Execute $batPath
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "Prism-AutoStart" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Starts the Prism Docker Compose stack at user login" `
    -RunLevel Highest

Write-Host "Scheduled task 'Prism-AutoStart' registered successfully."
