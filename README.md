# Orbspeak Windows Engine & UI

This repository now contains both the existing SpeakOrb web UI (React + Vite) and a new Windows-focused delivery path built on .NET 8.

It is also the home of the **Audio Mastery** stack: local Whisper dictation, OpenAI cloud STT/TTS, vendored [OpenWhispr](https://github.com/OpenWhispr/openwhispr) (MIT), and vendored [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) (Apache 2.0). See [docs/AUDIO_MASTERY.md](docs/AUDIO_MASTERY.md) and [THIRD_PARTY.md](THIRD_PARTY.md).

## Process boundaries

- **Engine (`/engine`)**: Single resident Windows process. Owns WASAPI audio capture, Whisper.net or OpenAI ASR, Qwen/OpenAI TTS playback, IPC server, and structured logs. Spawns on demand if not running.
- **UI (`/ui`)**: WebView2 Desktop host (Orbspeak.exe). Embeds the React app from `app/`, injects `window.__engineIpc`, and talks to the Engine over a named pipe. Spawns the Engine if needed.
- **Shared (`/shared`)**: Canonical IPC contract (JSON Schemas and DTOs), shared constants, and versioning rules.
- **Qwen sidecar (`/python/qwen_tts_sidecar`)**: Localhost Python process wrapping `third_party/qwen3-tts`.
- **Third-party (`/third_party`)**: Vendored OpenWhispr and Qwen3-TTS source (licenses preserved; no API keys or model weights).
- **Installer (`/installer`)**: Inno Setup script for a 64-bit Windows installer. See `installer/README.md`.
- **Tests (`/tests`)**: IPC smoke tests and protocol “golden” tests that validate messages against the shared schemas.

The IPC API is **frozen v1** in `/shared`. Engine and UI may evolve independently as long as they honor this contract.

## Windows 64-bit build

1. **Publish** (from repo root):
   ```powershell
   .\scripts\publish-win-x64.ps1
   ```
   Output: `ui\bin\Release\net8.0-windows\win-x64\publish\` with `Orbspeak.exe`, `Orbspeak.Engine.exe`, and `app\`.

2. **Run**: `Orbspeak.exe` is the main entry. It starts the Engine if needed, then opens the WebView with the React UI.

3. **Installer**: After publishing, run `iscc installer\Orbspeak.iss` (Inno Setup 6). See `installer/README.md` for WebView2, Whisper model first-run, and code-signing.

