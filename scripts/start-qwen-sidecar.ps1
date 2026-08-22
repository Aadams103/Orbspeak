param(
    [string]$HostName = "127.0.0.1",
    [int]$Port = 8765,
    [string]$Preload = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw "Python is not on PATH. Install Python 3.12+, then rerun this script."
}

Write-Host "Installing vendored Qwen3-TTS into the current Python environment..."
python -m pip install -e "$root\third_party\qwen3-tts"

Write-Host "Starting Qwen3-TTS sidecar on http://${HostName}:${Port}"
Write-Host "First launch downloads model weights from Hugging Face. That is free; it is not a purchase."
python "$root\python\qwen_tts_sidecar\sidecar.py" --host $HostName --port $Port --preload $Preload
