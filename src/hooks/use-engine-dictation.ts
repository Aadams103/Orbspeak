import { useState, useCallback, useEffect } from "react";
import type { SpeechRecognitionState, UseSpeechRecognitionReturn } from "@/hooks/use-speech-recognition";

declare global {
  interface Window {
    __engineIpc?: {
      onPartial: (f: (p: { text?: string }) => void) => void;
      onFinal: (f: (p: { text?: string }) => void) => void;
      onState: (f: (p: { state?: string }) => void) => void;
      onError: (f: (p: { code?: string; message?: string }) => void) => void;
      start: (opts?: { profileId?: string; mode?: string }) => void;
      stop: () => void;
    };
  }
}

export type UseEngineDictationReturn = UseSpeechRecognitionReturn;

export function useEngineDictation(): UseEngineDictationReturn {
  const isSupported = typeof window !== "undefined" && !!window.__engineIpc;

  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    transcript: "",
    interimTranscript: "",
    error: null,
    isSupported: !!isSupported,
    language: "en-US",
    isDemoMode: false,
  });

  useEffect(() => {
    const ipc = window.__engineIpc;
    if (!ipc) return;

    ipc.onPartial((p) => {
      setState((prev) => ({
        ...prev,
        interimTranscript: p?.text ?? "",
      }));
    });

    ipc.onFinal((p) => {
      const t = (p?.text ?? "").trim();
      if (!t) return;
      setState((prev) => ({
        ...prev,
        transcript: prev.transcript + t + " ",
        interimTranscript: "",
      }));
    });

    ipc.onState((p) => {
      setState((prev) => ({
        ...prev,
        isListening: p?.state === "dictating",
      }));
    });

    ipc.onError((p) => {
      const code = p?.code ?? "";
      const msg =
        code === "model_download_failed"
          ? "Model download failed. Check your network and try again."
          : code === "permission_denied" || code === "mic_access_denied"
            ? "Microphone access was denied. Allow access in system/browser settings and try again."
            : (p?.message ?? "Dictation error").trim()
              ? (p?.message ?? "Dictation error")
              : "Dictation error";
      setState((prev) => ({
        ...prev,
        error: msg,
        isListening: false,
      }));
    });
  }, []);

  const startListening = useCallback(
    (_language?: string) => {
      if (!isSupported) {
        setState((prev) => ({
          ...prev,
          error: "Engine dictation is not available",
        }));
        return;
      }
      window.__engineIpc!.start({ profileId: "default", mode: "default" });
      setState((prev) => ({ ...prev, error: null }));
    },
    [isSupported]
  );

  const stopListening = useCallback(() => {
    if (isSupported) window.__engineIpc!.stop();
    setState((prev) => ({
      ...prev,
      isListening: false,
      interimTranscript: "",
    }));
  }, [isSupported]);

  const resetTranscript = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transcript: "",
      interimTranscript: "",
    }));
  }, []);

  const setLanguage = useCallback((language: string) => {
    setState((prev) => ({ ...prev, language }));
  }, []);

  const simulateInput = useCallback((_text: string) => {
    // No-op; Engine does not support simulated input
  }, []);

  const startDemoMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isListening: true,
      isDemoMode: true,
      transcript: "",
      interimTranscript: "",
      error: null,
    }));
  }, []);

  const stopDemoMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isListening: false,
      isDemoMode: false,
      interimTranscript: "",
    }));
  }, []);

  return {
    state,
    startListening,
    stopListening,
    resetTranscript,
    setLanguage,
    simulateInput,
    startDemoMode,
    stopDemoMode,
  };
}
