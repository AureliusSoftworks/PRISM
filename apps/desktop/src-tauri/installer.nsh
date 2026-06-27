; PRISM Desktop NSIS installer hooks.
; NSIS_HOOK_PREINSTALL fires before any files are extracted.
;
; Kills any running Prism processes so the installer can overwrite
; runtime binaries (node.exe, qdrant.exe, libvips DLLs) without
; hitting "Error opening file for writing" dialogs on upgrade.
;
; Uses nsis_tauri_utils (Tauri's bundled NSIS plugin) for process
; detection and kill — nsProcess is not available in Tauri's NSIS env.
; node.exe is killed via PowerShell filtered to Prism's runtime path
; so unrelated Node.js apps on the machine are unaffected.
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

  ; Kill node.exe processes running from Prism's runtime folder only
  nsExec::ExecToLog "powershell.exe -NoProfile -NonInteractive -Command $\"Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '*\Prism\runtime\*' } | Stop-Process -Force$\""
  Pop $R0

  Sleep 1000
  SetDetailsPrint lastused
!macroend
