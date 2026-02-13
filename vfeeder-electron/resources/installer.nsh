; Custom NSIS installer script for vFeeder Config
; Includes VC++ 2015 Redistributable for Windows 7 compatibility

!macro customInit
  ; Check if VC++ 2015 runtime is installed
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != "1"
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x86" "Installed"
  ${EndIf}

  ${If} $0 != "1"
    ; VC++ runtime not found, install it
    File /oname=$PLUGINSDIR\vc_redist.x86.exe "${BUILD_RESOURCES_DIR}\vc_redist.x86.exe"
    ExecWait '"$PLUGINSDIR\vc_redist.x86.exe" /install /quiet /norestart'
  ${EndIf}
!macroend
