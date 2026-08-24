import { ArtworkPanel } from "@/features/studio/ArtworkPanel";
import { DELIVERY_PRESETS, matchDeliveryPreset } from "@/features/studio/deliveryPresets";
import { PronunciationTable } from "@/features/studio/PronunciationTable";
import { LocalCloudBadge } from "@/components/voice/LocalCloudBadge";
import { ProviderLabel } from "@/components/voice/ProviderLabel";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { TTS_PROVIDERS, SPEECH_RATE, type TtsProviderId, type TtsVoiceInfo, voicesForProvider } from "./ttsContracts";
import { providerOptionLabel } from "@/lib/provider-labels";
import type { StudioStyle } from "./studioTypes";

type Props = {
  style: StudioStyle;
  provider: TtsProviderId;
  catalogs: Partial<Record<TtsProviderId, TtsVoiceInfo[]>>;
  coverDataUrl?: string | null;
  scenes?: string[];
  busy?: boolean;
  onChange: (next: StudioStyle) => void;
  onGenerateArtwork: (prompt: string, kind: "cover" | "scene") => Promise<void>;
};

export function StudioInspector({
  style,
  provider,
  catalogs,
  coverDataUrl,
  scenes,
  busy,
  onChange,
  onGenerateArtwork,
}: Props) {
  const voices = voicesForProvider(provider, catalogs);
  const selected = voices.find((voice) => voice.id === style.ttsVoice) ?? voices[0];
  const preset = matchDeliveryPreset(style.instruct);

  return (
    <div className="space-y-6 p-4">
      {selected ? (
        <div className="rounded-lg border bg-card p-4">
          <p className="font-medium">{selected.displayName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProviderLabel provider={provider} />
            <LocalCloudBadge provider={provider} />
          </div>
          {selected.description ? <p className="mt-2 text-xs text-muted-foreground">{selected.description}</p> : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="studio-provider">Engine</Label>
        <select
          id="studio-provider"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={provider}
          onChange={(event) => onChange({ ...style, ttsProvider: event.target.value as TtsProviderId })}
        >
          {TTS_PROVIDERS.map((id) => (
            <option key={id} value={id}>
              {providerOptionLabel(id)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="studio-voice">Voice</Label>
        <select
          id="studio-voice"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={style.ttsVoice}
          onChange={(event) => onChange({ ...style, ttsVoice: event.target.value })}
        >
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Delivery</Label>
        <div className="flex flex-wrap gap-1.5">
          {DELIVERY_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-md border px-2 py-1 text-xs ${
                preset === item.id ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"
              }`}
              onClick={() => onChange({ ...style, instruct: item.instruct })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <details className="rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Advanced instruction</summary>
          <div className="mt-2 space-y-2">
            <Textarea
              rows={2}
              value={style.instruct}
              onChange={(event) => onChange({ ...style, instruct: event.target.value })}
              placeholder="Narrator tone"
            />
            <Textarea
              rows={3}
              value={style.styleMarkdown}
              onChange={(event) => onChange({ ...style, styleMarkdown: event.target.value })}
              placeholder="Style notes"
            />
          </div>
        </details>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Speed</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{style.ttsRate.toFixed(1)}x</span>
        </div>
        <Slider
          min={SPEECH_RATE.min}
          max={SPEECH_RATE.max}
          step={0.1}
          value={[style.ttsRate]}
          onValueChange={([value]) => onChange({ ...style, ttsRate: value })}
        />
      </div>

      <PronunciationTable csv={style.pronunciationCsv} onChange={(pronunciationCsv) => onChange({ ...style, pronunciationCsv })} />

      <div className="border-t border-border pt-4 opacity-90">
        <ArtworkPanel coverDataUrl={coverDataUrl} scenes={scenes} busy={busy} onGenerate={onGenerateArtwork} />
      </div>
    </div>
  );
}
