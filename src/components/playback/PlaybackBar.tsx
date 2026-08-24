import type { ComponentProps } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Square } from "lucide-react";
import { usePlayback } from "@/components/playback/PlaybackProvider";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SpeakOptions } from "@/features/studio/useTtsPlayback";
import { SPEECH_RATE, type TtsVoiceInfo } from "@/features/studio/ttsContracts";
import { formatClock } from "@/lib/document-meta";
import { friendlyProviderLabel } from "@/lib/provider-labels";

type Props = {
  sentences: string[];
  settings: Omit<SpeakOptions, "text">;
  voices?: TtsVoiceInfo[];
  disabled?: boolean;
  onRateChange?: (rate: number) => void;
  onVoiceChange?: (voiceId: string) => void;
};

export function PlaybackBar({ sentences, settings, voices = [], disabled, onRateChange, onVoiceChange }: Props) {
  const playback = usePlayback();
  const total = sentences.length;
  const current = playback.highlightIndex == null ? null : playback.highlightIndex + 1;
  const canSkip = total > 0 && !disabled;

  const playFrom = (index: number) => {
    void playback.playFrom(sentences, index, settings);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-1">
        <IconButton label="Previous sentence" disabled={!canSkip} onClick={() => playFrom(Math.max((playback.highlightIndex ?? 1) - 1, 0))}>
          <ChevronLeft className="size-4" />
        </IconButton>
        {!playback.speaking ? (
          <IconButton label="Play" disabled={!canSkip} onClick={() => playFrom(0)}>
            <Play className="size-4" />
          </IconButton>
        ) : playback.paused ? (
          <IconButton label="Resume" onClick={() => void playback.resume()}>
            <Play className="size-4" />
          </IconButton>
        ) : (
          <IconButton label="Pause" onClick={() => void playback.pause()}>
            <Pause className="size-4" />
          </IconButton>
        )}
        <IconButton label="Stop" disabled={!playback.speaking} onClick={() => void playback.stop()}>
          <Square className="size-4" />
        </IconButton>
        <IconButton
          label="Next sentence"
          disabled={!canSkip}
          onClick={() => playFrom(Math.min((playback.highlightIndex ?? -1) + 1, total - 1))}
        >
          <ChevronRight className="size-4" />
        </IconButton>
      </div>

      <div className="min-w-[7rem] text-xs text-muted-foreground">
        {total === 0 ? "No sentences" : current == null ? `Ready • ${total}` : `${current} of ${total}`}
        {playback.timing?.startMs != null && playback.timing.endMs != null ? (
          <span className="ml-2">
            {formatClock(playback.timing.startMs)} / {formatClock(playback.timing.endMs)}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-[10rem] flex-1 items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Speed</span>
        <Slider
          min={SPEECH_RATE.min}
          max={SPEECH_RATE.max}
          step={0.1}
          value={[settings.rate]}
          onValueChange={([value]) => onRateChange?.(value)}
          className="flex-1"
        />
        <span className="w-10 text-right text-xs tabular-nums">{settings.rate.toFixed(1)}x</span>
      </div>

      <label className="flex min-w-[12rem] items-center gap-2 text-xs text-muted-foreground">
        <span>Voice</span>
        <select
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-foreground"
          value={settings.voiceId}
          onChange={(event) => onVoiceChange?.(event.target.value)}
        >
          {voices.map((voice) => (
            <option key={`${voice.provider}-${voice.id}`} value={voice.id}>
              {voice.displayName}
            </option>
          ))}
        </select>
      </label>
      <span className="text-[11px] text-muted-foreground">{friendlyProviderLabel(settings.provider)}</span>
      {playback.error ? <p className="basis-full text-xs text-destructive">{playback.error}</p> : null}
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
