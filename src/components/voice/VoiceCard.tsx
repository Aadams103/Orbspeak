import { LocalCloudBadge } from "@/components/voice/LocalCloudBadge";
import { ProviderLabel } from "@/components/voice/ProviderLabel";
import { Button } from "@/components/ui/button";
import type { TtsVoiceInfo } from "@/features/studio/ttsContracts";
import { cn } from "@/lib/utils";

type Props = {
  voice: TtsVoiceInfo;
  selected?: boolean;
  onSelect?: () => void;
  onPreview?: () => void;
  previewAvailable?: boolean;
};

export function VoiceCard({ voice, selected, onSelect, onPreview, previewAvailable }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border bg-card p-4 text-left transition hover:border-primary/40",
        selected && "border-primary bg-primary/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{voice.displayName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ProviderLabel provider={voice.provider} />
            <LocalCloudBadge provider={voice.provider} />
            {voice.language ? <span className="text-xs text-muted-foreground">{voice.language}</span> : null}
          </div>
        </div>
        {previewAvailable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              onPreview?.();
            }}
          >
            Preview
          </Button>
        ) : null}
      </div>
      {voice.description ? <p className="mt-3 text-sm text-muted-foreground">{voice.description}</p> : null}
    </button>
  );
}
