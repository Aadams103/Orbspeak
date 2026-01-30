# Build and publish Orbspeak for Windows 11 (64-bit).
# Run from repo root. Produces ui/bin/Release/net8.0-windows/win-x64/publish/ with
# Orbspeak.exe, Orbspeak.Engine.exe, app/, and all dependencies.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $root

# 1) Build React app (npm). Use build:no-check to avoid Unix-only check:safe (timeout) on Windows.
#    CopyReactToApp in the UI project runs npm run build during Build; we run once here to fail fast.
if (Test-Path "package.json") {
    Write-Host "Building React app..."
    npm run build:no-check
}

# 2) Publish Engine (win-x64, self-contained)
Write-Host "Publishing Engine (win-x64)..."
dotnet publish engine/Orbspeak.Engine.csproj -c Release -r win-x64 --self-contained true

# 3) Publish Desktop/UI (win-x64, self-contained). This runs CopyReactToApp and copies app/ into output.
Write-Host "Publishing Desktop (win-x64)..."
dotnet publish ui/Orbspeak.Ui.csproj -c Release -r win-x64 --self-contained true

$engPub = "engine\bin\Release\net8.0\win-x64\publish"
$uiPub  = "ui\bin\Release\net8.0-windows\win-x64\publish"

if (-not (Test-Path $engPub)) {
    Write-Error "Engine publish folder not found: $engPub"
}
if (-not (Test-Path $uiPub)) {
    Write-Error "UI publish folder not found: $uiPub"
}

# 4) Copy Engine exe and its dependencies into the UI publish folder
Write-Host "Copying Engine into Desktop publish..."
Copy-Item -Path "$engPub\*" -Destination $uiPub -Recurse -Force

Write-Host "Done. Output: $uiPub"
Write-Host "  - Orbspeak.exe (Desktop host)"
Write-Host "  - Orbspeak.Engine.exe"
Write-Host "  - app\ (React build)"
