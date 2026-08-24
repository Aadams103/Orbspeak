# Orbspeak audio mastery stack

Orbspeak is now one Windows program with three speech engines behind a single
IPC contract:

| Job | Default | Paid option | Source in this repo |
| --- | --- | --- | --- |
| Speech to text | Local Whisper.net | OpenAI `whisper-1` / `gpt-4o-transcribe` | `engine/Asr` plus [OpenWhispr](https://github.com/OpenWhispr/openwhispr) in `third_party/openwhispr` |
| Text to speech | Qwen3-TTS sidecar | OpenAI TTS | [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) in `third_party/qwen3-tts` |
| Desktop dictation UX | SpeakOrb / Orbspeak UI | — | `src/`, `ui/` |

You do **not** buy the Qwen3-TTS or OpenWhispr source. Both are open source
(Apache-2.0 and MIT). What you may pay for is **OpenAI API usage**. Model
weights for local Whisper and Qwen3-TTS download free from Hugging Face.

## What was added

- `third_party/qwen3-tts` — Qwen3-TTS Python package (Apache-2.0)
- `third_party/openwhispr` — OpenWhispr 1.8.3 source snapshot (MIT)
- `python/qwen_tts_sidecar` — localhost HTTP wrapper the Engine calls
- Engine providers:
  - `asrProvider`: `local` or `openai`
  - `ttsProvider`: `qwen3` or `openai`

Existing v1 methods are unchanged. `tts.speak` / `tts.pause` / `tts.resume` /
`tts.stop` are now implemented. `settings.get` with key `audio.providers`
returns the catalog.

## Cost map (nothing here is a one-time data purchase)

| Asset | Cost | How you get it |
| --- | --- | --- |
| OpenWhispr source | Free (MIT) | Already vendored |
| Qwen3-TTS source | Free (Apache-2.0) | Already vendored |
| Whisper ggml `base.en` | Free | Engine downloads on first local dictation |
| Qwen3-TTS 0.6B CustomVoice | Free | Hugging Face download on first sidecar run |
| Qwen3-TTS 1.7B models | Free, needs more VRAM | Same Hugging Face collection |
| OpenAI transcription | Pay per minute | [OpenAI audio API](https://platform.openai.com/docs/guides/speech-to-text) |
| OpenAI TTS | Pay per character | [OpenAI TTS](https://platform.openai.com/docs/guides/text-to-speech) |
| OpenAI API key | Account + billing | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

Recommended local start: Whisper.net + Qwen `Qwen3-TTS-12Hz-0.6B-CustomVoice`.
Use OpenAI only when you want cloud accuracy or do not have a GPU.

## Configure providers

Copy `docs/examples/engine.json` to:

`%LOCALAPPDATA%\Orbspeak\config\engine.json`

Set the OpenAI key in the environment, never in git:

```powershell
$env:OPENAI_API_KEY = "sk-..."
```

Or write `%LOCALAPPDATA%\Orbspeak\config\secrets.json`:

```json
{ "openaiApiKey": "sk-..." }
```

Switch from the UI/IPC:

```json
{
  "v": 1,
  "type": "request",
  "id": "1",
  "method": "settings.set",
  "params": {
    "values": {
      "asrProvider": "openai",
      "ttsProvider": "qwen3"
    }
  }
}
```

## Run local Qwen3-TTS

1. Install Python 3.12+.
2. From the repo root:

```powershell
.\scripts\start-qwen-sidecar.ps1
```

3. Leave that process running. The Engine posts to `http://127.0.0.1:8765/v1/speak`.

If the sidecar is down and an OpenAI key is present, TTS falls back to OpenAI.

## Studio (Speechify reader + artwork)

In the desktop app, use the **Dictate / Studio** switcher.

- Library files: `%LOCALAPPDATA%\Orbspeak\library\{profileId}\{docId}\`
- Profile voice/style: `%LOCALAPPDATA%\Orbspeak\library\{profileId}\profile\`
- Upload `.txt`, `.md`, or `.pdf`. Read-aloud highlights one sentence at a time via `tts.progress`.
- Artwork calls xAI `grok-imagine-image-2.0`. Set `XAI_API_KEY` or add `xaiApiKey` to `secrets.json`. Never commit that key.
- Voiceover writes `voiceover.wav` next to the document.

## Speak / transcribe from the frozen v1 IPC

```json
{ "v": 1, "type": "request", "id": "d1", "method": "dictation.start", "params": { "mode": "default", "profileId": "default" } }
{ "v": 1, "type": "request", "id": "d2", "method": "dictation.stop", "params": {} }
{ "v": 1, "type": "request", "id": "t1", "method": "tts.speak", "params": { "text": "Hello from Orbspeak.", "voiceId": "Vivian" } }
```

## License obligations

See `third_party/NOTICE.md`. Keep `third_party/qwen3-tts/LICENSE` and
`third_party/openwhispr/LICENSE` when you ship this repository.
