import { describe, expect, it } from "vitest";
import { applyPronunciation, splitSentences, studioPerformanceInstruction } from "./applyStyle";
import { DEFAULT_STUDIO_STYLE } from "./studioTypes";
import {
  clampSpeechRate,
  composePerformanceInstruction,
  parseTtsProviderId,
  playbackStateFromEngine,
  resolveVoiceId,
  shouldApplyTtsEvent,
} from "./ttsContracts";

describe("studio speech contracts", () => {
  it("parses only real OrbSpeak providers", () => {
    expect(parseTtsProviderId("qwen3")).toBe("qwen3");
    expect(parseTtsProviderId("openai")).toBe("openai");
    expect(() => parseTtsProviderId("elevenlabs")).toThrow(/qwen3/);
  });

  it("clamps playback rate instead of discarding it", () => {
    expect(clampSpeechRate(1.6)).toBe(1.6);
    expect(clampSpeechRate(0.1)).toBe(0.5);
    expect(clampSpeechRate(4)).toBe(2);
  });

  it("composes narrator and style instructions without touching pronunciation", () => {
    expect(composePerformanceInstruction("calm documentary narrator", "intimate delivery")).toBe(
      "calm documentary narrator. intimate delivery",
    );
    expect(studioPerformanceInstruction({ ...DEFAULT_STUDIO_STYLE, instruct: "warm", styleMarkdown: "slow" })).toBe(
      "warm. slow",
    );
    expect(applyPronunciation("Orbspeak uses Qwen", "Orbspeak,Orb speak\nQwen,Chewen")).toBe("Orb speak uses Chewen");
  });

  it("keeps highlighting sentences aligned with processed text", () => {
    const spoken = applyPronunciation("Hello there. Orbspeak is ready.", "Orbspeak,Orb speak");
    expect(splitSentences(spoken)).toEqual(["Hello there.", "Orb speak is ready."]);
  });

  it("ignores stale playback events from a previous session", () => {
    expect(shouldApplyTtsEvent("aaa", "bbb")).toBe(false);
    expect(shouldApplyTtsEvent("aaa", "aaa")).toBe(true);
    expect(playbackStateFromEngine("paused")).toBe("paused");
    expect(playbackStateFromEngine("completed")).toBe("completed");
  });

  it("remaps impossible voices when the provider changes", () => {
    expect(resolveVoiceId("openai", "Vivian")).toBe("alloy");
    expect(resolveVoiceId("qwen3", "alloy")).toBe("Vivian");
    expect(resolveVoiceId("qwen3", "Ryan")).toBe("Ryan");
  });
});
