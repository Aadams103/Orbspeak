# Orbspeak Installer

This directory contains the Inno Setup script and notes for building a Windows 64-bit installer.

## Prerequisites

- **Inno Setup 6** (https://jrsoftware.org/isinfo.php) – to compile the installer
- **WebView2** – Windows 11 includes a compatible WebView2. On Windows 10, users may need to install the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if it is missing.
- **Whisper model** – not bundled. On first dictation, the Engine downloads `ggml-base.en` to `%LOCALAPPDATA%\Orbspeak\models\` if missing.

## Build order

1. Run the 64-bit publish script from the repo root:
   ```
   .\scripts\publish-win-x64.ps1
   ```
   This produces `ui\bin\Release\net8.0-windows\win-x64\publish\` with:
   - `Orbspeak.exe` (Desktop host)
   - `Orbspeak.Engine.exe`
   - `app\` (React UI)
   - and all required DLLs/runtimes.

2. Compile the installer (requires Inno Setup 6):
   ```
   iscc installer\Orbspeak.iss
   ```
   Output: `OrbspeakSetup-1.0.0-win-x64.exe` in the `installer\` folder (or the path set in the script).

## Layout (64-bit)

- **Architecture:** x64 only; `ArchitecturesAllowed=x64`.
- **Install path:** `%ProgramFiles%\Orbspeak\` (or `%LocalAppData%\Programs\Orbspeak` for per-user).
- **Shortcuts:** Start Menu (and optional Desktop) to `Orbspeak.exe`.

## Code signing (recommended for production)

To avoid SmartScreen warnings, sign the installer and the main executables.

**Steps**

1. **Obtain a certificate** – Get a code-signing certificate (EV or standard) and export to PFX. Do not commit PFX files or passwords; use CI secrets or a secure store.
2. **Pre-sign executables (optional)** – After running `publish-win-x64.ps1`, run `signtool sign ...` on `Orbspeak.exe` and `Orbspeak.Engine.exe` in `ui\bin\Release\net8.0-windows\win-x64\publish\` so the installed app is already signed.
3. **Sign the installer** – In `Orbspeak.iss`, uncomment and set the `SignTool` line, e.g.:
   ```ini
   SignTool=signtool sign /f "C:\path\to\cert.pfx" /p <password> /tr http://timestamp.digicert.com /td sha256 /fd sha256 $f
   ```
   Then run `iscc installer\Orbspeak.iss`; the compiler will sign the output setup exe.

## MSIX (optional)

For Store or managed deployment, create an MSIX package that lays out the same files and declares `Orbspeak.exe` as the start target. Use `makeappx` / `makemsix` or a pipeline; 64-bit and WebView2 as a dependency. Not provided in this repo.
