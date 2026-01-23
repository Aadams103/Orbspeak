/**
 * Help Me Write Floating Panel
 * 
 * A floating UI component that appears when triggered via hotkey.
 * Uses clipboard as primary method for reliable text access.
 * Completely independent of dictation functionality.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Wand2, Copy, X, AlertCircle } from "lucide-react";
import { useHelpMeWriteClipboard } from "@/hooks/use-help-me-write-clipboard";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function HelpMeWriteFloatingPanel() {
  const {
    text,
    hasText,
    isVisible,
    showPanel,
    hidePanel,
    style,
    setStyle,
    rewrittenText,
    isProcessing,
    copyToClipboard,
    readFromClipboard,
    clearText,
    availableStyles,
    error,
  } = useHelpMeWriteClipboard();

  // Listen for hotkey trigger
  useEffect(() => {
    const handleTrigger = () => {
      showPanel();
    };

    window.addEventListener("help-me-write-trigger", handleTrigger);
    return () => {
      window.removeEventListener("help-me-write-trigger", handleTrigger);
    };
  }, [showPanel]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Calculate position - center of screen for clipboard-based approach
  const getPanelPosition = (): React.CSSProperties => {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 10000,
      maxWidth: "90vw",
      maxHeight: "90vh",
    };
  }

  return (
    <Card
      className="w-96 shadow-2xl border-border/50 backdrop-blur-xl bg-background/95"
      style={getPanelPosition()}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Help Me Write</span>
            {text && (
              <span className="text-xs text-muted-foreground">
                ({text.source === "clipboard" ? "from clipboard" : "from selection"})
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={hidePanel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* No Text Message */}
        {!hasText && !error && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              No text selected. Copy text (Ctrl/Cmd+C) then try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Style Selection */}
        {hasText && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {availableStyles.map((s) => (
                <Button
                  key={s.value}
                  variant={style === s.value ? "default" : "outline"}
                  size="sm"
                  className="h-auto py-1.5 px-2 flex flex-col items-start text-left"
                  onClick={() => setStyle(s.value)}
                >
                  <span className="text-xs font-medium">{s.label}</span>
                </Button>
              ))}
            </div>

            {/* Original Text Preview */}
            {text && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Original:</span>
                <div className="p-2 bg-muted/50 border rounded-md text-sm max-h-20 overflow-auto">
                  {text.text}
                </div>
              </div>
            )}

            {/* Rewritten Text Preview */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Rewritten:</span>
              <div className="p-2 bg-primary/5 border border-primary/20 rounded-md text-sm max-h-32 overflow-auto">
                {isProcessing ? (
                  <span className="text-muted-foreground animate-pulse">
                    Processing...
                  </span>
                ) : (
                  rewrittenText || text?.text || "No rewritten text available"
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 gap-1 h-8"
                      onClick={() => copyToClipboard(rewrittenText || text?.text || "")}
                      disabled={!rewrittenText || isProcessing}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy rewritten text to clipboard</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-8"
                onClick={async () => {
                  // Try to read from clipboard again
                  await readFromClipboard();
                }}
              >
                Refresh
              </Button>
            </div>
          </>
        )}

        {/* Instructions */}
        <div className="pt-2 border-t text-xs text-muted-foreground">
          <p>💡 Tip: Copy text (Ctrl/Cmd+C), then press the hotkey to rewrite it.</p>
        </div>
      </CardContent>
    </Card>
  );
}

