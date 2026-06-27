; PRISM Desktop NSIS installer hooks.
;
; NSIS_HOOK_PREINSTALL runs before any files are extracted.  If a previous
; Prism install left orphaned child processes (node.exe, qdrant.exe) — either
; because the user force-quit the app or because an older build pre-dates the
; Job Object fix — those processes hold file locks on runtime binaries and
; cause "Error opening file for writing" dialogs during upgrade.
;
; Fix strategy:
;   1. Gracefully close the tray app via WM_CLOSE so it can clean up.
;   2. Force-kill prism_desktop.exe and qdrant.exe by name if still alive.
;   3. Kill only the node.exe processes that live under Prism's install
;      directory (avoids collateral damage to other Node.js apps on the system).

!macro NSIS_HOOK_PREINSTALL
  SetDetailsPrint listonly
  DetailPrint "PRISM pre-install: terminating any running Prism processes..."

  ; 1. Ask the tray app to close gracefully (gives Job Object time to fire).
  FindWindow $0 "" "PRISM"
  IntCmp $0 0 prism_no_window
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 1500
  prism_no_window:

  ; 2. Force-kill the main process and Qdrant by name.
  nsProcess::_FindProcess "prism_desktop.exe" $R0
  StrCmp $R0 "0" 0 skip_prism
    nsProcess::_KillProcess "prism_desktop.exe" $R0
    Sleep 1000
  skip_prism:

  nsProcess::_FindProcess "qdrant.exe" $R0
  StrCmp $R0 "0" 0 skip_qdrant
    nsProcess::_KillProcess "qdrant.exe" $R0
    Sleep 500
  skip_qdrant:

  ; 3. Kill node.exe processes that are running from this install's runtime
  ;    folder only — leaves any other Node.js apps on the machine untouched.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -Command \
    "Get-Process node -ErrorAction SilentlyContinue \
     | Where-Object { $_.Path -like ''*\Prism\runtime\*'' } \
     | Stop-Process -Force"'

  Sleep 500
  SetDetailsPrint lastused
!macroend
