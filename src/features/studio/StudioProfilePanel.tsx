import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StudioStyle } from "./studioTypes";

type Props = {
  style: StudioStyle;
  onChange: (next: StudioStyle) => void;
  onSave: () => void;
  busy?: boolean;
};

export function StudioProfilePanel({ style, onChange, onSave, busy }: Props) {
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
            value={style.ttsVoice}
            onChange={(event) => onChange({ ...style, ttsVoice: event.target.value })}
          />
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
            onChange={(event) => onChange({ ...style, ttsRate: Number(event.target.value) || 1 })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tts-provider">TTS provider</Label>
          <Input
            id="tts-provider"
            value={style.ttsProvider}
            onChange={(event) => onChange({ ...style, ttsProvider: event.target.value })}
          />
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
