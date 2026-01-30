import type { UseSpeechRecognitionReturn } from "@/hooks/use-speech-recognition";
import { useEngineDictation } from "@/hooks/use-engine-dictation";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

/**
 * Uses Engine-backed dictation when running in the Orbspeak desktop host (window.__engineIpc),
 * otherwise falls back to the browser Web Speech API.
 */
export function useDictation(): UseSpeechRecognitionReturn {
  const engine = useEngineDictation();
  const web = useSpeechRecognition();

  if (typeof window !== "undefined" && window.__engineIpc) {
    return engine;
  }
  return web;
}
