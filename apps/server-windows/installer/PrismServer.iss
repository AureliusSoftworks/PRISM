; Prism Server Windows installer. Build with scripts/build-installer.ps1.
#define MyAppName "Prism Server"
#define MyAppVersion GetEnv("PRISM_SERVER_VERSION")
#if MyAppVersion == ""
  #define MyAppVersion "0.2.0"
#endif
#define MyAppPublisher "Prism"
#define MyAppExeName "Prism Server.exe"
#define MyAppId "{{7F52847D-0569-4A6D-88C7-7C8A05B2898E}"
#define PayloadDir GetEnv("PRISM_SERVER_PAYLOAD_DIR")
#if PayloadDir == ""
  #define PayloadDir "..\src\bin\Release\net8.0-windows\win-x64\publish"
#endif

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\Prism Server
DefaultGroupName=Prism Server
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\dist
OutputBaseFilename=Prism-Server-Setup-v{#MyAppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\src\Assets\prism-server.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "autostart"; Description: "Start Prism Server when I sign in"; GroupDescription: "Startup behavior:"; Flags: checkedonce

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Prism Server"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{userdesktop}\Prism Server"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PrismServer"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Prism Server"; Flags: nowait postinstall skipifsilent

[Code]
var
  DeleteDataPage: TInputOptionWizardPage;

procedure InitializeUninstallProgressForm();
var
  PrismDataDir: string;
begin
  PrismDataDir := ExpandConstant('{localappdata}\Prism');
  DeleteDataPage := CreateInputOptionPage(
    wpSelectUninstallMethod,
    'Prism Server Data',
    'Choose whether to remove local Prism data.',
    'By default, Prism Server leaves your config, chats, memory, and logs in place so a reinstall can pick them back up. Check this only if you want a complete local wipe.',
    True,
    False);
  DeleteDataPage.Add('Also delete Prism data and logs at ' + PrismDataDir + ' (config, chats, memory, logs)');
  DeleteDataPage.Values[0] := False;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  PrismDataDir: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'PrismServer');
    PrismDataDir := ExpandConstant('{localappdata}\Prism');
    if DeleteDataPage.Values[0] and DirExists(PrismDataDir) then
    begin
      DelTree(PrismDataDir, True, True, True);
    end;
  end;
end;
