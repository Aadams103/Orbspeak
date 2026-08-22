# Qwen3-TTS sidecar

Local HTTP service used by `Orbspeak.Engine` for `tts.speak`.

Listens on `127.0.0.1:8765` only.

```powershell
.\scripts\start-qwen-sidecar.ps1
```

Or manually:

```powershell
cd python\qwen_tts_sidecar
python -m pip install -e ..\..\third_party\qwen3-tts
python sidecar.py
```

## Endpoints

- `GET /health` — `{ "ready": true, "model": "..." }`
- `GET /voices` — speakers and languages from the loaded CustomVoice model
- `POST /v1/speak` — JSON `{ "text", "speaker?", "language?", "instruct?" }`
  returns a WAV file

Model weights download from Hugging Face on first synthesis. They are not
stored in git.
