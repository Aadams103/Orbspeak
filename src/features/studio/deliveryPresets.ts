export type DeliveryPresetId = "natural" | "conversational" | "narrator" | "dramatic" | "calm" | "energetic";

export type DeliveryPreset = {
  id: DeliveryPresetId;
  label: string;
  instruct: string;
};

export const DELIVERY_PRESETS: DeliveryPreset[] = [
  { id: "natural", label: "Natural", instruct: "natural speaking voice" },
  { id: "conversational", label: "Conversational", instruct: "conversational" },
  { id: "narrator", label: "Narrator", instruct: "calm narrator" },
  { id: "dramatic", label: "Dramatic", instruct: "dramatic" },
  { id: "calm", label: "Calm", instruct: "calm" },
  { id: "energetic", label: "Energetic", instruct: "energetic" },
];

export function matchDeliveryPreset(instruct: string | undefined | null): DeliveryPresetId | null {
  const value = (instruct ?? "").trim().toLowerCase();
  if (!value) return null;
  const exact = DELIVERY_PRESETS.find((preset) => preset.instruct.toLowerCase() === value);
  return exact?.id ?? null;
}
