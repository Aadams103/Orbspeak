import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  hasVoiceover?: boolean;
  dataUrl?: string | null;
  busy?: boolean;
  onExport: () => Promise<string | undefined>;
};

export function VoiceoverPanel({ hasVoiceover, dataUrl, busy, onExport }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(dataUrl ?? null);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Voiceover</h3>
        <p className="text-sm text-muted-foreground">
          Render the full document to a WAV file in your local library folder.
        </p>
      </div>
      <Button
        disabled={busy}
        onClick={async () => {
          setError(null);
          try {
            const next = await onExport();
            if (next) setUrl(next);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        Generate voiceover
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {url ? <audio controls src={url} className="w-full" /> : null}
      {!url && hasVoiceover ? (
        <p className="text-sm text-muted-foreground">A voiceover already exists on disk.</p>
      ) : null}
    </div>
  );
}
