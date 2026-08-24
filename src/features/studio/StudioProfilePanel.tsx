import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listTtsVoices } from "./studioClient";
import type { StudioStyle } from "./studioTypes";
import {
  TTS_PROVIDERS,
  clampSpeechRate,
  parseTtsProviderId,
  resolveVoiceId,
  voicesForProvider,
  type TtsProviderId,
  type TtsVoiceInfo,
} from "./ttsContracts";

type Props = {
  style: StudioStyle;
  onChange: (next: StudioStyle) => void;
  onSave: () => void;
  busy?: boolean;
};

export function StudioProfilePanel({ style, onChange, onSave, busy }: Props) {
  const [catalogs, setCatalogs] = useState<Partial<Record<TtsProviderId, TtsVoiceInfo[]>>>({});
  const provider = (() => {
    try {
      return parseTtsProviderId(style.ttsProvider);
    } catch {
      return "qwen3" as const;
    }
  })();
  const voices = voicesForProvider(provider, catalogs);

  useEffect(() => {
    listTtsVoices()
      .then(setCatalogs)
      .catch(() => undefined);
  }, []);

  const changeProvider = (nextProvider: TtsProviderId) => {
    onChange({
      ...style,
      ttsProvider: nextProvider,
      ttsVoice: resolveVoiceId(nextProvider, style.ttsVoice, catalogs),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Profile voice and formatting</h3>
        <p className="text-sm text-muted-foreground">
          Saved under %LOCALAPPDATA%\Orbspeak\library\default\profile\
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tts-voice">Voice</Label>
          <Input
            id="tts-voice"
            list="tts-voices"
            value={style.ttsVoice}
            onChange={(event) => onChange({ ...style, ttsVoice: event.target.value })}
          />
          <datalist id="tts-voices">
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.displayName}
              </option>
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tts-rate">Rate</Label>
          <Input
            id="tts-rate"
            type="number"
            min={0.5}
            max={2}
            step={0.1}
            value={style.ttsRate}
            onChange={(event) => onChange({ ...style, ttsRate: clampSpeechRate(Number(event.target.value)) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tts-provider">TTS provider</Label>
          <select
            id="tts-provider"
            value={provider}
            onChange={(event) => changeProvider(event.target.value as TtsProviderId)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TTS_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {id === "qwen3" ? "qwen3" : "openai"}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="artwork-style">Artwork style</Label>
          <Input
            id="artwork-style"
            value={style.artworkStyle}
            onChange={(event) => onChange({ ...style, artworkStyle: event.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="instruct">Qwen instruct / narrator tone</Label>
        <Input
          id="instruct"
          value={style.instruct}
          onChange={(event) => onChange({ ...style, instruct: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {provider === "qwen3"
            ? "Sent to Qwen as narrator instruct when the loaded CustomVoice model supports it."
            : "Mapped to OpenAI TTS instructions when the configured model supports them."}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="style-md">Style notes (Speechify-style formatting)</Label>
        <Textarea
          id="style-md"
          rows={5}
          value={style.styleMarkdown}
          onChange={(event) => onChange({ ...style, styleMarkdown: event.target.value })}
          placeholder="How this voice should read: pacing, formality, emphasis..."
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pronunciation">Pronunciation CSV (heard,said)</Label>
        <Textarea
          id="pronunciation"
          rows={4}
          value={style.pronunciationCsv}
          onChange={(event) => onChange({ ...style, pronunciationCsv: event.target.value })}
          placeholder={"Orbspeak,Orb speak\nQwen,Chewen"}
        />
      </div>
      <Button onClick={onSave} disabled={busy}>
        Save profile
      </Button>
    </div>
  );
}
