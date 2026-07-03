; PRISM Desktop NSIS installer hooks.
; NSIS_HOOK_PREINSTALL fires before any files are extracted.
;
; Kills any running Prism processes so the installer can overwrite
; runtime binaries (node.exe, qdrant.exe, libvips DLLs) without
; hitting "Error opening file for writing" dialogs on upgrade.
;
; Uses nsis_tauri_utils (Tauri's bundled NSIS plugin) for process
; detection and kill — nsProcess is not available in Tauri's NSIS env.
; Prism runtime children are killed via PowerShell filtered to Prism's
; install/runtime paths so unrelated Node.js apps on the machine are
; unaffected.
;
; NSIS escaping notes:
;   $$   -> literal $ in a double-quoted NSIS string
;   $\"  -> literal " in a double-quoted NSIS string

!macro NSIS_HOOK_PREINSTALL
  SetDetailsPrint listonly
  DetailPrint "PRISM pre-install: terminating Prism processes..."

  ; Kill the Prism desktop shell (Job Object in new builds kills children too)
  nsis_tauri_utils::KillProcessCurrentUser "prism_desktop.exe"
  Pop $R0

  ; Kill Qdrant
  nsis_tauri_utils::KillProcessCurrentUser "qdrant.exe"
  Pop $R0

  ; Kill orphaned Prism shell/runtime processes by install path. This catches
  ; older builds whose Job Object did not take node.exe/qdrant.exe down with
  ; the desktop shell, and loops briefly so file handles are released before
  ; extraction overwrites runtime binaries.
  nsExec::ExecToLog "powershell.exe -NoProfile -ExecutionPolicy Bypass -NonInteractive -Command $\"$$ErrorActionPreference = 'SilentlyContinue'; 1..12 | ForEach-Object { Get-CimInstance Win32_Process | Where-Object { $$path = [string]$$_.ExecutablePath; $$command = [string]$$_.CommandLine; (($$_.Name -eq 'prism_desktop.exe') -and (($$path -like '*\AppData\Local\Prism\prism_desktop.exe') -or ($$path -like '*\AppData\Local\PRISM\prism_desktop.exe'))) -or (($$_.Name -in @('node.exe','qdrant.exe')) -and (($$path -like '*\AppData\Local\Prism\runtime\*') -or ($$path -like '*\AppData\Local\PRISM\runtime\*') -or ($$command -like '*AppData\Local\Prism\runtime*') -or ($$command -like '*AppData\Local\PRISM\runtime*'))) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }; Start-Sleep -Milliseconds 250 }$\""
  Pop $R0

  Sleep 2000
  SetDetailsPrint lastused
!macroend
