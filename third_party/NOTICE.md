# Third-party source included in Orbspeak

This folder vendors the upstream source for the two projects that now sit
inside the Orbspeak audio stack. Model weights are **not** stored here.

## Qwen3-TTS

- Path: `third_party/qwen3-tts`
- Upstream: https://github.com/QwenLM/Qwen3-TTS
- License: Apache License 2.0 (`third_party/qwen3-tts/LICENSE`)
- Copyright: 2026 Alibaba Cloud / Qwen team
- Role in Orbspeak: local text-to-speech via `python/qwen_tts_sidecar`

## OpenWhispr

- Path: `third_party/openwhispr`
- Upstream: https://github.com/OpenWhispr/openwhispr
- License: MIT (`third_party/openwhispr/LICENSE`)
- Copyright: 2024 OpenWhispr Team
- Version snapshot: 1.8.3 (package.json)
- Role in Orbspeak: reference implementation for local Whisper / NVIDIA
  Parakeet dictation, BYOK OpenAI transcription, and desktop voice UX.

Orbspeak does not relicense these projects. Keep their LICENSE files when
you redistribute this repository.
