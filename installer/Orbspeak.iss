; Orbspeak Windows 11 64-bit installer (Inno Setup 6)
; Run after scripts\publish-win-x64.ps1. Compile with: iscc installer\Orbspeak.iss

#define MyAppName "Orbspeak"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Orbspeak"
#define MyAppExeName "Orbspeak.exe"
#define MyPublishDir "..\ui\bin\Release\net8.0-windows\win-x64\publish"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=OrbspeakSetup-{#MyAppVersion}-win-x64
SetupIconFile=
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; 64-bit only
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
; Windows 11 (or 10)
MinVersion=10.0.19041
PrivilegesRequired=lowest
; Optional: uncomment to sign. Requires signtool and a code-signing certificate.
; SignTool=signtool sign /f "path\to\cert.pfx" /p password /tr http://timestamp.digicert.com /td sha256 /fd sha256 $f

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#MyPublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
