import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEngineIpc } from "@/lib/engine-ipc";
import { loadAudioProviders, recognitionStatusLabel, type AudioProvidersSnapshot } from "@/lib/engine-status";
import { asrFriendlyLabel, friendlyProviderLabel } from "@/lib/provider-labels";

export function SettingsPage() {
  const [snapshot, setSnapshot] = useState<AudioProvidersSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [xaiKey, setXaiKey] = useState("");
  const [sidecarUrl, setSidecarUrl] = useState("");
  const ipc = getEngineIpc();

  const refresh = async () => {
    const next = await loadAudioProviders();
    setSnapshot(next);
    setSidecarUrl(next?.sidecarUrl ?? "");
  };

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const apply = async (values: Record<string, unknown>) => {
    if (!ipc?.settingsSet) {
      setError("Settings need the OrbSpeak desktop engine.");
      return;
    }
    setError(null);
    try {
      await ipc.settingsSet(values);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audio Engines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row
            label="Local TTS"
            value={snapshot ? `${friendlyProviderLabel("qwen3")} • ${snapshot.active?.tts === "openai" ? "Standby" : "Ready"}` : "Engine offline"}
          />
          <Row
            label="Cloud TTS"
            value={snapshot ? `${friendlyProviderLabel("openai")} • ${snapshot.active?.tts === "openai" ? "Ready" : "Standby"}` : "Engine offline"}
          />
          <Row label="Speech recognition" value={snapshot ? recognitionStatusLabel(snapshot) : "Engine offline"} />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant={snapshot?.active?.tts !== "openai" ? "default" : "outline"} onClick={() => void apply({ ttsProvider: "qwen3" })}>
              Use Qwen Local
            </Button>
            <Button size="sm" variant={snapshot?.active?.tts === "openai" ? "default" : "outline"} onClick={() => void apply({ ttsProvider: "openai" })}>
              Use OpenAI Cloud
            </Button>
            <Button size="sm" variant={snapshot?.active?.asr !== "openai" ? "default" : "outline"} onClick={() => void apply({ asrProvider: "local" })}>
              Use Whisper Local
            </Button>
            <Button size="sm" variant={snapshot?.active?.asr === "openai" ? "default" : "outline"} onClick={() => void apply({ asrProvider: "openai" })}>
              Use OpenAI ASR
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="OpenAI" value={snapshot?.active?.openaiKeyConfigured ? "Connected" : "Not configured"} />
          <Row label="xAI" value={snapshot?.active?.xaiKeyConfigured ? "Connected" : "Not configured"} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="openai-key">OpenAI key</Label>
              <Input
                id="openai-key"
                type="password"
                autoComplete="off"
                value={openaiKey}
                onChange={(event) => setOpenaiKey(event.target.value)}
                placeholder="Paste a new key"
              />
              <Button size="sm" disabled={!openaiKey.trim()} onClick={() => void apply({ openaiApiKey: openaiKey }).then(() => setOpenaiKey(""))}>
                Save OpenAI key
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="xai-key">xAI key</Label>
              <Input
                id="xai-key"
                type="password"
                autoComplete="off"
                value={xaiKey}
                onChange={(event) => setXaiKey(event.target.value)}
                placeholder="Paste a new key"
              />
              <Button size="sm" disabled={!xaiKey.trim()} onClick={() => void apply({ xaiApiKey: xaiKey }).then(() => setXaiKey(""))}>
                Save xAI key
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">OrbSpeak library on this PC</p>
          {ipc?.settingsOpenDataFolder ? (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await ipc.settingsOpenDataFolder?.();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Open folder
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advanced</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Active TTS id" value={snapshot?.active?.tts ?? "—"} />
          <Row label="Active ASR id" value={snapshot?.active?.asr ?? "—"} />
          <Row label="Recognition" value={asrFriendlyLabel(snapshot?.active?.asr)} />
          <div className="space-y-1">
            <Label htmlFor="sidecar-url">Sidecar URL</Label>
            <Input id="sidecar-url" value={sidecarUrl} onChange={(event) => setSidecarUrl(event.target.value)} />
            <Button size="sm" variant="outline" disabled={!sidecarUrl.trim()} onClick={() => void apply({ qwenSidecarUrl: sidecarUrl })}>
              Save sidecar URL
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
