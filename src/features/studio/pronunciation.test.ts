import { describe, expect, it } from "vitest";
import { createPronunciationRow, parsePronunciationRows, serializePronunciationRows } from "./pronunciation";

describe("pronunciation table", () => {
  it("round-trips CSV rows without inventing data", () => {
    const csv = "Orbspeak,Orb speak\nQwen,Chewen";
    const rows = parsePronunciationRows(csv);
    expect(rows.map((row) => [row.heard, row.said])).toEqual([
      ["Orbspeak", "Orb speak"],
      ["Qwen", "Chewen"],
    ]);
    expect(serializePronunciationRows(rows)).toBe(csv);
  });

  it("ignores comments and blank lines", () => {
    expect(parsePronunciationRows("# note\n\nheard,said")).toEqual([
      expect.objectContaining({ heard: "heard", said: "said" }),
    ]);
  });

  it("drops empty rows when serializing", () => {
    expect(serializePronunciationRows([createPronunciationRow("", ""), createPronunciationRow("a", "b")])).toBe("a,b");
  });
});
