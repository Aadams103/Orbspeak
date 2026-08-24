"""Pure helpers for the Qwen sidecar so they can be tested without torch."""

from __future__ import annotations


def normalize_model_id(model_id: str | None) -> str:
    return (model_id or "").strip() or "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"


def instruct_supported_for_model(model_id: str | None) -> bool:
    compact = normalize_model_id(model_id).lower().replace("-", "")
    return "0.6b" not in compact and "0b6" not in compact


def resolve_speak_request(payload: dict) -> dict:
    text = str(payload.get("text") or "").strip()
    model_id = normalize_model_id(payload.get("model"))
    speaker = str(payload.get("speaker") or "Ryan").strip() or "Ryan"
    language = str(payload.get("language") or "English").strip() or "English"
    instruct = payload.get("instruct")
    if isinstance(instruct, str):
        instruct = instruct.strip() or None
    else:
        instruct = None

    supported = instruct_supported_for_model(model_id)
    applied = bool(instruct) and supported
    return {
        "text": text,
        "model": model_id,
        "speaker": speaker,
        "language": language,
        "instruct": instruct if applied else None,
        "instruct_supported": supported,
        "instruct_applied": applied,
    }
