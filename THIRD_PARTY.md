# Third-party notices

Orbspeak vendors two upstream projects so speech-to-text and speech-to-speech
can live in one Windows audio program. Their original licenses still apply.

## OpenWhispr

- Path: `third_party/openwhispr`
- License: MIT
- Copyright: OpenWhispr Team
- Source: https://github.com/OpenWhispr/openwhispr

Used for dictation UX, local Whisper/Parakeet patterns, and OpenAI
bring-your-own-key transcription.

## Qwen3-TTS

- Path: `third_party/qwen3-tts`
- License: Apache License 2.0
- Copyright: 2026 Alibaba Cloud / Qwen Team
- Source: https://github.com/QwenLM/Qwen3-TTS

Used for local voice design, custom voice, and voice-clone text-to-speech.
The Apache 2.0 license text is in `third_party/qwen3-tts/LICENSE`.

## OpenAI

OpenAI is a **paid API**, not a vendored codebase. Orbspeak calls
`https://api.openai.com/v1/audio/transcriptions` and
`https://api.openai.com/v1/audio/speech` when you set an API key.
You buy usage from OpenAI; you do not buy the OpenWhispr or Qwen source.

## Whisper (local)

Local dictation still uses Whisper.net plus a ggml model downloaded on first
run. Those model files stay under `%LOCALAPPDATA%\Orbspeak\models\` and are
not committed.
