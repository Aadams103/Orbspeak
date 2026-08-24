import { useCallback, useEffect, useState } from "react";
import { getEngineIpc } from "@/lib/engine-ipc";

export function useTtsPlayback() {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ipc = getEngineIpc();
    ipc?.onTtsState?.((payload) => {
      const state = payload?.state;
      setSpeaking(state === "speaking");
      setPaused(state === "paused");
      if (state === "stopped") {
        setActiveIndex(null);
        if (payload?.error) setError(payload.error);
      }
    });
    ipc?.onTtsProgress?.((payload) => {
      if (typeof payload?.index === "number") setActiveIndex(payload.index);
    });
  }, []);

  const speak = useCallback(async (text: string, opts?: { voiceId?: string; rate?: number; instruct?: string }) => {
    const ipc = getEngineIpc();
    setError(null);
    if (ipc?.ttsSpeak) {
      setSpeaking(true);
      await ipc.ttsSpeak({ text, ...opts });
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = opts?.rate ?? 1;
      utterance.onend = () => {
        setSpeaking(false);
        setActiveIndex(null);
      };
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
      return;
    }
    throw new Error("No TTS engine is available.");
  }, []);

  const pause = useCallback(async () => {
    const ipc = getEngineIpc();
    if (ipc?.ttsPause) await ipc.ttsPause();
    else window.speechSynthesis?.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(async () => {
    const ipc = getEngineIpc();
    if (ipc?.ttsResume) await ipc.ttsResume();
    else window.speechSynthesis?.resume();
    setPaused(false);
  }, []);

  const stop = useCallback(async () => {
    const ipc = getEngineIpc();
    if (ipc?.ttsStop) await ipc.ttsStop();
    else window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPaused(false);
    setActiveIndex(null);
  }, []);

  return { speaking, paused, activeIndex, error, speak, pause, resume, stop };
}
