import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  coverDataUrl?: string | null;
  scenes?: string[];
  busy?: boolean;
  onGenerate: (prompt: string, kind: "cover" | "scene") => Promise<void>;
};

export function ArtworkPanel({ coverDataUrl, scenes = [], busy, onGenerate }: Props) {
  const [prompt, setPrompt] = useState("Cover art for this document, cinematic lighting");
  const [kind, setKind] = useState<"cover" | "scene">("cover");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Artwork</h3>
        <p className="text-sm text-muted-foreground">
          Uses the xAI Grok image API. Store the key locally — never in git.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="artwork-prompt">Prompt</Label>
        <Input
          id="artwork-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant={kind === "cover" ? "default" : "outline"}
          size="sm"
          onClick={() => setKind("cover")}
        >
          Cover
        </Button>
        <Button
          variant={kind === "scene" ? "default" : "outline"}
          size="sm"
          onClick={() => setKind("scene")}
        >
          Scene
        </Button>
        <Button
          disabled={busy || !prompt.trim()}
          onClick={async () => {
            setError(null);
            try {
              await onGenerate(prompt.trim(), kind);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Generate
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {coverDataUrl ? (
        <img src={coverDataUrl} alt="Document cover" className="max-h-64 rounded-md border object-cover" />
      ) : null}
      {scenes.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {scenes.map((src) => (
            <img key={src.slice(-24)} src={src} alt="Scene" className="rounded-md border object-cover" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
