import { describe, expect, it } from "vitest";
import { applyPronunciation, applyStudioStyle, splitSentences, studioPerformanceInstruction } from "./applyStyle";
import { DEFAULT_STUDIO_STYLE } from "./studioTypes";

describe("studio style", () => {
  it("replaces pronunciation pairs deterministically", () => {
    const csv = "Orbspeak,Orb speak\nQwen,Chewen";
    expect(applyPronunciation("Orbspeak uses Qwen", csv)).toBe("Orb speak uses Chewen");
    expect(applyPronunciation("Orbspeak uses Qwen", csv)).toBe("Orb speak uses Chewen");
  });

  it("keeps style notes out of the spoken text rewrite", () => {
    const text = applyStudioStyle("Orbspeak uses Qwen", {
      ...DEFAULT_STUDIO_STYLE,
      styleMarkdown: "warm audiobook narrator",
      pronunciationCsv: "Orbspeak,Orb speak\nQwen,Chewen",
    });
    expect(text).toBe("Orb speak uses Chewen");
    expect(studioPerformanceInstruction({ ...DEFAULT_STUDIO_STYLE, instruct: "warm audiobook narrator", styleMarkdown: "intimate" })).toBe(
      "warm audiobook narrator. intimate",
    );
  });

  it("splits sentences for highlighting", () => {
    expect(splitSentences("Hello there. How are you? Fine!")).toEqual([
      "Hello there.",
      "How are you?",
      "Fine!",
    ]);
  });
});
