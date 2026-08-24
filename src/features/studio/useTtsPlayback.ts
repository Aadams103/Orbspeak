import { useCallback, useEffect, useRef, useState } from "react";
import { engineErrorMessage, getEngineIpc } from "@/lib/engine-ipc";
import {
  playbackStateFromEngine,
  shouldApplyTtsEvent,
  type PlaybackState,
  type StudioSpeechSettings,
} from "./ttsContracts";

export type SpeakOptions = Omit<StudioSpeechSettings, "provider"> & {
  text: string;
  provider: string;
};

export type PlaybackTiming = {
  index: number;
  startMs?: number;
  endMs?: number;
};

export function useTtsPlayback() {
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [timing, setTiming] = useState<PlaybackTiming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const ignoreSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const ipc = getEngineIpc();
    ipc?.onTtsState?.((payload) => {
      if (payload?.sessionId && payload.sessionId === ignoreSessionRef.current) return;
      if (!shouldApplyTtsEvent(sessionRef.current, payload?.sessionId)) return;
      if (payload?.sessionId) {
        sessionRef.current = payload.sessionId;
        setSessionId(payload.sessionId);
      }
      const next = playbackStateFromEngine(payload?.state);
      setPlaybackState(next);
      if (next === "stopped" || next === "completed" || next === "error" || next === "idle") {
        setActiveIndex(null);
        setTiming(null);
      }
      if (next === "error" && payload?.error) setError(payload.error);
    });
    ipc?.onTtsProgress?.((payload) => {
      if (payload?.sessionId && payload.sessionId === ignoreSessionRef.current) return;
      if (!shouldApplyTtsEvent(sessionRef.current, payload?.sessionId)) return;
      if (typeof payload?.index === "number") {
        setActiveIndex(payload.index);
        setTiming({
          index: payload.index,
          startMs: typeof payload.startMs === "number" ? payload.startMs : undefined,
          endMs: typeof payload.endMs === "number" ? payload.endMs : undefined,
        });
      }
    });
    return () => {
      void ipc?.ttsStop?.();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback(async (opts: SpeakOptions) => {
    const ipc = getEngineIpc();
    if (sessionRef.current) ignoreSessionRef.current = sessionRef.current;
    sessionRef.current = null;
    setSessionId(null);
    setError(null);
    setActiveIndex(null);
    setTiming(null);
    setPlaybackState("loading");
    if (ipc?.ttsSpeak) {
      try {
        const result = (await ipc.ttsSpeak({
          text: opts.text,
          provider: opts.provider,
          voiceId: opts.voiceId,
          rate: opts.rate,
          instruct: opts.instruct,
          styleMarkdown: opts.styleMarkdown,
          pronunciationCsv: opts.pronunciationCsv,
        })) as { sessionId?: string } | undefined;
        if (result?.sessionId) {
          sessionRef.current = result.sessionId;
          setSessionId(result.sessionId);
        }
      } catch (err) {
        sessionRef.current = null;
        setSessionId(null);
        setPlaybackState("error");
        setActiveIndex(null);
        setError(engineErrorMessage(err));
      }
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(opts.text);
      utterance.rate = opts.rate;
      utterance.onend = () => {
        setPlaybackState("completed");
        setActiveIndex(null);
      };
      utterance.onerror = () => {
        setPlaybackState("error");
        setActiveIndex(null);
        setError("Browser speech synthesis failed.");
      };
      setPlaybackState("playing");
      window.speechSynthesis.speak(utterance);
      return;
    }
    setPlaybackState("error");
    throw new Error("No TTS engine is available.");
  }, []);

  const pause = useCallback(async () => {
    const ipc = getEngineIpc();
    if (ipc?.ttsPause) await ipc.ttsPause();
    else window.speechSynthesis?.pause();
    setPlaybackState("paused");
  }, []);

  const resume = useCallback(async () => {
    const ipc = getEngineIpc();
    if (ipc?.ttsResume) await ipc.ttsResume();
    else window.speechSynthesis?.resume();
    setPlaybackState("playing");
  }, []);

  const stop = useCallback(async () => {
    const ipc = getEngineIpc();
    if (ipc?.ttsStop) await ipc.ttsStop();
    else window.speechSynthesis?.cancel();
    sessionRef.current = null;
    setSessionId(null);
    setPlaybackState("stopped");
    setActiveIndex(null);
    setTiming(null);
  }, []);

  const speaking = playbackState === "loading" || playbackState === "playing" || playbackState === "paused";
  const paused = playbackState === "paused";

  return { playbackState, speaking, paused, activeIndex, timing, error, sessionId, speak, pause, resume, stop };
}
