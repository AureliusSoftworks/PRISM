; NSIS installer hooks for PRISM Desktop.
;
; preInit runs before any files are extracted.  If a previous PRISM install is
; still running (e.g. the user forgot to quit before upgrading), its child
; processes hold file locks on node.exe and libvips DLLs inside the runtime
; folder.  We kill them here so the installer can overwrite them cleanly.
;
; The Job Object in main.rs is the primary fix (children die automatically
; whenever the parent exits).  This hook is a belt-and-suspenders fallback
; that covers cases where the old build pre-dates the Job Object change.

!macro preInit
  SetDetailsPrint listonly

  ; Ask the tray app to close gracefully first.
  FindWindow $0 "" "PRISM"
  IntCmp $0 0 prism_no_window
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 1500
  prism_no_window:

  ; Force-kill any survivors by process name.
  nsProcess::_FindProcess "PRISM.exe" $R0
  StrCmp $R0 "0" 0 skip_prism
    nsProcess::_KillProcess "PRISM.exe" $R0
    Sleep 1000
  skip_prism:

  nsProcess::_FindProcess "qdrant.exe" $R0
  StrCmp $R0 "0" 0 skip_qdrant
    nsProcess::_KillProcess "qdrant.exe" $R0
  skip_qdrant:

  SetDetailsPrint lastused
!macroend
