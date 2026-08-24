import { describe, expect, it } from "vitest";
import { applyPronunciation, splitSentences } from "./applyStyle";

describe("studio style", () => {
  it("replaces pronunciation pairs", () => {
    const text = applyPronunciation("Orbspeak uses Qwen", "Orbspeak,Orb speak\nQwen,Chewen");
    expect(text).toBe("Orb speak uses Chewen");
  });

  it("splits sentences for highlighting", () => {
    expect(splitSentences("Hello there. How are you? Fine!")).toEqual([
      "Hello there.",
      "How are you?",
      "Fine!",
    ]);
  });
});
