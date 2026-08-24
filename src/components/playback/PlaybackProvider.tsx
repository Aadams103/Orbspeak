import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTtsPlayback, type SpeakOptions } from "@/features/studio/useTtsPlayback";

type PlaybackContextValue = ReturnType<typeof useTtsPlayback> & {
  sentenceOffset: number;
  highlightIndex: number | null;
  playFrom: (sentences: string[], startIndex: number, settings: Omit<SpeakOptions, "text">) => Promise<void>;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const playback = useTtsPlayback();
  const [sentenceOffset, setSentenceOffset] = useState(0);

  const highlightIndex = playback.activeIndex == null ? null : sentenceOffset + playback.activeIndex;

  const playFrom = useCallback(
    async (sentences: string[], startIndex: number, settings: Omit<SpeakOptions, "text">) => {
      const safeIndex = Math.min(Math.max(startIndex, 0), Math.max(sentences.length - 1, 0));
      const remaining = sentences.slice(safeIndex).join(" ");
      if (!remaining.trim()) return;
      setSentenceOffset(safeIndex);
      await playback.speak({ text: remaining, ...settings });
    },
    [playback.speak],
  );

  const value = useMemo<PlaybackContextValue>(
    () => ({
      ...playback,
      sentenceOffset,
      highlightIndex,
      playFrom,
    }),
    [playback, sentenceOffset, highlightIndex, playFrom],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) {
    throw new Error("usePlayback must be used inside PlaybackProvider");
  }
  return value;
}
