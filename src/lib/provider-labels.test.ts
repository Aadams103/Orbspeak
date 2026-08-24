import { describe, expect, it } from "vitest";
import { friendlyProviderLabel, isLocalProvider, localityLabel } from "./provider-labels";
import { matchDeliveryPreset } from "@/features/studio/deliveryPresets";

describe("provider labels", () => {
  it("never shows raw qwen3 in the normal UI label", () => {
    expect(friendlyProviderLabel("qwen3")).toBe("Qwen Local");
    expect(friendlyProviderLabel("openai")).toBe("OpenAI Cloud");
    expect(localityLabel("qwen3")).toBe("LOCAL");
    expect(localityLabel("openai")).toBe("CLOUD");
    expect(isLocalProvider("qwen3")).toBe(true);
  });
});

describe("delivery presets", () => {
  it("maps the default instruct to Narrator", () => {
    expect(matchDeliveryPreset("calm narrator")).toBe("narrator");
    expect(matchDeliveryPreset("custom tone")).toBeNull();
  });
});
