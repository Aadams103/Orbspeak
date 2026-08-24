import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { friendlyProviderLabel } from "@/lib/provider-labels";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  voiceName: string;
  provider: string;
  busy?: boolean;
  onExport: () => Promise<void>;
};

export function ExportDialog({ open, onOpenChange, projectName, voiceName, provider, busy, onExport }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setDone(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export voiceover</DialogTitle>
          <DialogDescription>WAV only. The file is written to this project on your PC.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Project</span> · {projectName}
          </p>
          <p>
            <span className="text-muted-foreground">Voice</span> · {voiceName}
          </p>
          <p>
            <span className="text-muted-foreground">Engine</span> · {friendlyProviderLabel(provider)}
          </p>
          <p className="rounded-md border border-border bg-secondary/40 px-3 py-2">WAV voiceover</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {done ? <p className="text-sm text-muted-foreground">Voiceover written to the project library.</p> : null}
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              setError(null);
              setDone(false);
              try {
                await onExport();
                setDone(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            {busy ? "Exporting…" : "Export WAV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
