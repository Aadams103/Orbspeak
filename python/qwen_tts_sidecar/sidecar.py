#!/usr/bin/env python3
"""Local HTTP sidecar that wraps the vendored Qwen3-TTS package for Orbspeak."""

from __future__ import annotations

import argparse
import io
import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

SIDECAR_DIR = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "third_party" / "qwen3-tts"
if str(SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(SIDECAR_DIR))
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

from sidecar_support import instruct_supported_for_model, resolve_speak_request

MODEL = None
MODEL_ID = None
LOAD_ERROR = None


def json_bytes(payload: dict[str, Any], status: int = 200) -> tuple[int, bytes, str]:
    return status, json.dumps(payload).encode("utf-8"), "application/json"


def wav_bytes(samples, sample_rate: int) -> bytes:
    import numpy as np
    import soundfile as sf

    buffer = io.BytesIO()
    audio = np.asarray(samples, dtype=np.float32)
    sf.write(buffer, audio, sample_rate, format="WAV")
    return buffer.getvalue()


def load_model(model_id: str) -> None:
    global MODEL, MODEL_ID, LOAD_ERROR
    if MODEL is not None and MODEL_ID == model_id:
        return

    try:
        import torch
        from qwen_tts import Qwen3TTSModel
    except Exception as exc:  # pragma: no cover - environment dependent
        LOAD_ERROR = (
            "Qwen3-TTS is not installed. From the repo root run: "
            "pip install -e third_party/qwen3-tts"
        )
        raise RuntimeError(LOAD_ERROR) from exc

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32
    kwargs: dict[str, Any] = {"device_map": device, "dtype": dtype}
    MODEL = Qwen3TTSModel.from_pretrained(model_id, **kwargs)
    MODEL_ID = model_id
    LOAD_ERROR = None


class Handler(BaseHTTPRequestHandler):
    server_version = "OrbspeakQwenSidecar/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("qwen-sidecar: " + (fmt % args) + "\n")

    def _send(self, status: int, body: bytes, content_type: str, extra_headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            status, body, ctype = json_bytes(
                {
                    "ok": True,
                    "ready": MODEL is not None,
                    "model": MODEL_ID,
                    "vendor": str(VENDOR),
                    "error": LOAD_ERROR,
                    "instructSupported": instruct_supported_for_model(MODEL_ID),
                }
            )
            self._send(status, body, ctype)
            return

        if path == "/voices":
            speakers = []
            languages = []
            if MODEL is not None:
                try:
                    speakers = list(MODEL.model.get_supported_speakers() or [])
                    languages = list(MODEL.model.get_supported_languages() or [])
                except Exception:
                    speakers, languages = [], []
            status, body, ctype = json_bytes(
                {
                    "speakers": speakers,
                    "languages": languages,
                    "instructSupported": instruct_supported_for_model(MODEL_ID),
                    "model": MODEL_ID,
                }
            )
            self._send(status, body, ctype)
            return

        self._send(*json_bytes({"error": "not_found"}, 404))

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/v1/speak":
            self._send(*json_bytes({"error": "not_found"}, 404))
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send(*json_bytes({"error": "invalid_json"}, 400))
            return

        request = resolve_speak_request(payload)
        if not request["text"]:
            self._send(*json_bytes({"error": "text is required"}, 400))
            return

        try:
            load_model(request["model"])
            wavs, sr = MODEL.generate_custom_voice(
                text=request["text"],
                speaker=request["speaker"],
                language=request["language"],
                instruct=request["instruct"],
            )
            audio = wavs[0]
            self._send(
                200,
                wav_bytes(audio, sr),
                "audio/wav",
                {
                    "X-Orbspeak-Instruct-Supported": "true" if request["instruct_supported"] else "false",
                    "X-Orbspeak-Instruct-Applied": "true" if request["instruct_applied"] else "false",
                    "X-Orbspeak-Speaker": request["speaker"],
                },
            )
        except Exception as exc:
            traceback.print_exc()
            self._send(*json_bytes({"error": str(exc)}, 500))


def main() -> int:
    parser = argparse.ArgumentParser(description="Orbspeak Qwen3-TTS sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--preload",
        default="",
        help="Optional Hugging Face model id to load at startup.",
    )
    args = parser.parse_args()

    if args.preload:
        try:
            load_model(args.preload)
        except Exception as exc:
            print(f"preload failed: {exc}", file=sys.stderr)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Qwen3-TTS sidecar listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("sidecar stopping", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
