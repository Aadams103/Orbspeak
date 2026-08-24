import { useEffect, useMemo, useState } from "react";
import { VoiceCard } from "@/components/voice/VoiceCard";
import { Button } from "@/components/ui/button";
import { usePlayback } from "@/components/playback/PlaybackProvider";
import { listTtsVoices, loadStyle, saveStyle } from "@/features/studio/studioClient";
import { DEFAULT_STUDIO_STYLE, type StudioStyle } from "@/features/studio/studioTypes";
import { getEngineIpc } from "@/lib/engine-ipc";
import { isLocalProvider } from "@/lib/provider-labels";
import type { TtsProviderId, TtsVoiceInfo } from "@/features/studio/ttsContracts";

type Filter = "all" | "local" | "cloud";

export function VoiceLibrary() {
  const playback = usePlayback();
  const [catalogs, setCatalogs] = useState<Partial<Record<TtsProviderId, TtsVoiceInfo[]>>>({});
  const [style, setStyle] = useState<StudioStyle>(DEFAULT_STUDIO_STYLE);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const previewAvailable = Boolean(getEngineIpc()?.ttsSpeak) || typeof window !== "undefined";

  useEffect(() => {
    listTtsVoices()
      .then(setCatalogs)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadStyle()
      .then(setStyle)
      .catch(() => undefined);
  }, []);

  const voices = useMemo(() => {
    const all = [...(catalogs.qwen3 ?? []), ...(catalogs.openai ?? [])];
    if (filter === "local") return all.filter((voice) => isLocalProvider(voice.provider));
    if (filter === "cloud") return all.filter((voice) => !isLocalProvider(voice.provider));
    return all;
  }, [catalogs, filter]);

  const selectVoice = async (voice: TtsVoiceInfo) => {
    const next = { ...style, ttsVoice: voice.id, ttsProvider: voice.provider };
    setStyle(next);
    try {
      setStyle(await saveStyle(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Built-in voices from the local and cloud engines. Voice cloning is not available yet.
        </p>
        <div className="flex gap-1">
          {(["all", "local", "cloud"] as const).map((id) => (
            <Button key={id} size="sm" variant={filter === id ? "default" : "outline"} onClick={() => setFilter(id)}>
              {id === "all" ? "All" : id === "local" ? "Local" : "Cloud"}
            </Button>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {voices.map((voice) => (
          <VoiceCard
            key={`${voice.provider}-${voice.id}`}
            voice={voice}
            selected={style.ttsVoice === voice.id && style.ttsProvider === voice.provider}
            onSelect={() => void selectVoice(voice)}
            previewAvailable={previewAvailable}
            onPreview={() =>
              void playback.speak({
                text: "OrbSpeak reads this voice on this PC.",
                provider: voice.provider,
                voiceId: voice.id,
                rate: style.ttsRate,
                instruct: style.instruct,
                styleMarkdown: style.styleMarkdown,
                pronunciationCsv: style.pronunciationCsv,
              })
            }
          />
        ))}
      </div>
      {playback.error ? <p className="text-sm text-destructive">{playback.error}</p> : null}
    </div>
  );
}
