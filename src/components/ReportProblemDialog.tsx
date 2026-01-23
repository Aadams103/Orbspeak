import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getLogCollector, type DiagnosticInfo } from "@/lib/log-collector";
import { getVersionInfo } from "@/lib/version";
import { Bug, Download, Copy, Check, AlertCircle } from "lucide-react";

interface ReportProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProfileName?: string | null;
  activeProfileId?: string | null;
}

export function ReportProblemDialog({
  open,
  onOpenChange,
  activeProfileName,
  activeProfileId,
}: ReportProblemDialogProps) {
  const [description, setDescription] = useState("");
  const [diagnosticInfo, setDiagnosticInfo] = useState<DiagnosticInfo | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logCollector = getLogCollector();
  const versionInfo = getVersionInfo();

  // Collect diagnostic info when dialog opens
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ReportProblemDialog.tsx:41',message:'ReportProblemDialog useEffect',data:{open,hasVersionInfo:!!versionInfo,hasLogCollector:!!logCollector},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (open) {
      setIsCollecting(true);
      setError(null);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ReportProblemDialog.tsx:46',message:'Starting diagnostic collection',data:{activeProfileName,activeProfileId,versionInfo},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      logCollector
        .getDiagnosticInfo({
          activeProfileName,
          activeProfileId,
          appVersion: versionInfo.appVersion,
          buildVersion: versionInfo.buildVersion,
          schemaVersion: versionInfo.schemaVersion,
          minutes: 5, // Last 5 minutes of logs
        })
        .then((info) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ReportProblemDialog.tsx:56',message:'Diagnostic info collected',data:{logsCount:info.logs.length,errorsCount:info.errors.length,hasInfo:!!info},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          setDiagnosticInfo(info);
          setIsCollecting(false);
        })
        .catch((err) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ReportProblemDialog.tsx:59',message:'Diagnostic collection failed',data:{error:err.message,errorType:err.constructor.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          setError(`Failed to collect diagnostic info: ${err.message}`);
          setIsCollecting(false);
        });
    } else {
      // Reset when dialog closes
      setDescription("");
      setCopied(false);
      setError(null);
    }
  }, [open, activeProfileName, activeProfileId, logCollector, versionInfo]);

  /**
   * Export diagnostic info as text file
   */
  const handleExportZip = async () => {
    if (!diagnosticInfo) return;

    try {
      // Create diagnostic report text
      const reportText = logCollector.formatDiagnosticInfo(diagnosticInfo, description);

      // Download as text file
      const blob = new Blob([reportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `speakorb-diagnostic-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to export: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /**
   * Copy diagnostic info to clipboard
   */
  const handleCopyToClipboard = async () => {
    if (!diagnosticInfo) return;

    try {
      const reportText = logCollector.formatDiagnosticInfo(diagnosticInfo, description);
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(`Failed to copy to clipboard: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Report a Problem
          </DialogTitle>
          <DialogDescription>
            Help us fix issues by providing diagnostic information. Your data is kept private.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">What happened? (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe the problem you encountered..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-2 flex-1 flex flex-col min-h-0">
            <Label>Diagnostic Information</Label>
            <ScrollArea className="flex-1 border rounded-md p-4 bg-muted/20">
              {isCollecting ? (
                <div className="text-sm text-muted-foreground">Collecting diagnostic information...</div>
              ) : diagnosticInfo ? (
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>App Version:</strong> {diagnosticInfo.appVersion} (build {diagnosticInfo.buildVersion})
                  </div>
                  <div>
                    <strong>Schema Version:</strong> {diagnosticInfo.schemaVersion}
                  </div>
                  <div>
                    <strong>OS:</strong> {diagnosticInfo.os}
                  </div>
                  <div>
                    <strong>Active Profile:</strong> {diagnosticInfo.activeProfileName || 'None'}
                  </div>
                  <div>
                    <strong>Screen:</strong> {diagnosticInfo.screenInfo.width}x{diagnosticInfo.screenInfo.height} (DPI: {diagnosticInfo.screenInfo.devicePixelRatio})
                  </div>
                  <div>
                    <strong>Recent Logs:</strong> {diagnosticInfo.logs.length} entries
                  </div>
                  <div>
                    <strong>Recent Errors:</strong> {diagnosticInfo.errors.length} entries
                  </div>
                  {diagnosticInfo.errors.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <strong>Recent Errors:</strong>
                      {diagnosticInfo.errors.slice(0, 5).map((error, idx) => (
                        <div key={idx} className="p-2 bg-destructive/10 rounded text-xs">
                          <div className="font-mono">{error.message}</div>
                          {error.stack && (
                            <div className="mt-1 text-muted-foreground font-mono text-[10px]">
                              {error.stack.split('\n').slice(0, 3).join('\n')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No diagnostic information available</div>
              )}
            </ScrollArea>
          </div>

          <div className="flex items-center justify-between gap-2 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Diagnostic data includes app version, OS, active profile name (not content), and recent logs.
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCopyToClipboard}
                disabled={!diagnosticInfo || isCollecting}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                onClick={handleExportZip}
                disabled={!diagnosticInfo || isCollecting}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

