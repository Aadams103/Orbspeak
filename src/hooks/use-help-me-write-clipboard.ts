/**
 * Help Me Write Hook (Clipboard-Based)
 * 
 * Reliable Help Me Write implementation using clipboard as primary method.
 * 
 * Primary: User copies text (Ctrl/Cmd+C) then invokes hotkey → read clipboard
 * Secondary: If direct selection access exists, use it; otherwise don't rely on it
 * 
 * This avoids OS-permission nightmares and makes the feature dependable.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  type HelpMeWriteStyle,
  rewriteText,
  HELP_ME_WRITE_STYLES,
} from "@/lib/help-me-write";
import { ClipboardManager } from "@/lib/clipboard-manager";

export interface ClipboardText {
  text: string;
  source: "clipboard" | "selection";
  timestamp: number;
}

export interface UseHelpMeWriteClipboardReturn {
  // Text state
  text: ClipboardText | null;
  hasText: boolean;
  
  // UI state
  isVisible: boolean;
  showPanel: () => void;
  hidePanel: () => void;
  
  // Style
  style: HelpMeWriteStyle;
  setStyle: (style: HelpMeWriteStyle) => void;
  
  // Rewritten text
  rewrittenText: string;
  isProcessing: boolean;
  
  // Actions
  readFromClipboard: () => Promise<boolean>;
  readFromSelection: () => boolean;
  copyToClipboard: (text: string) => Promise<boolean>;
  clearText: () => void;
  
  // Available styles
  availableStyles: typeof HELP_ME_WRITE_STYLES;
  
  // Error state
  error: string | null;
}

/**
 * Hook for Help Me Write using clipboard as primary method
 */
export function useHelpMeWriteClipboard(): UseHelpMeWriteClipboardReturn {
  const [text, setText] = useState<ClipboardText | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [style, setStyle] = useState<HelpMeWriteStyle>("formal");
  const [rewrittenText, setRewrittenText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastClipboardCheckRef = useRef<number>(0);
  const clipboardCheckIntervalRef = useRef<number | null>(null);

  // Process text when text or style changes
  useEffect(() => {
    if (text && text.text.trim()) {
      setIsProcessing(true);
      setError(null);
      
      // Process with delay for better UX
      const timer = setTimeout(() => {
        try {
          const result = rewriteText(text.text, style);
          setRewrittenText(result);
          setIsProcessing(false);
        } catch (err) {
          console.error("Failed to rewrite text:", err);
          setError("Failed to process text");
          setIsProcessing(false);
        }
      }, 200);

      return () => clearTimeout(timer);
    } else {
      setRewrittenText("");
      setIsProcessing(false);
      setError(null);
    }
  }, [text, style]);

  /**
   * Read text from clipboard (PRIMARY METHOD)
   */
  const readFromClipboard = useCallback(async (): Promise<boolean> => {
    try {
      const clipboardText = await ClipboardManager.readText();
      
      if (!clipboardText || clipboardText.trim().length === 0) {
        setError("No text in clipboard. Copy some text first (Ctrl/Cmd+C), then try again.");
        setText(null);
        return false;
      }

      // Minimum text length
      if (clipboardText.trim().length < 3) {
        setError("Text is too short. Please copy at least 3 characters.");
        setText(null);
        return false;
      }

      setText({
        text: clipboardText,
        source: "clipboard",
        timestamp: Date.now(),
      });
      
      setError(null);
      return true;
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      setError("Failed to read clipboard. Please ensure clipboard permissions are granted.");
      return false;
    }
  }, []);

  /**
   * Read text from selection (SECONDARY METHOD - fallback only)
   */
  const readFromSelection = useCallback((): boolean => {
    try {
      const selection = window.getSelection();
      
      if (!selection || selection.rangeCount === 0) {
        return false;
      }

      const selectedText = selection.toString().trim();
      
      if (!selectedText || selectedText.length < 3) {
        return false;
      }

      // Only use selection if we don't have clipboard text
      // This is a fallback, not primary
      if (!text || text.source !== "clipboard") {
        setText({
          text: selectedText,
          source: "selection",
          timestamp: Date.now(),
        });
        setError(null);
        return true;
      }

      return false;
    } catch (err) {
      console.error("Failed to read selection:", err);
      return false;
    }
  }, [text]);

  /**
   * Copy text to clipboard
   */
  const copyToClipboard = useCallback(async (textToCopy: string): Promise<boolean> => {
    const success = await ClipboardManager.writeText(textToCopy);
    if (success) {
      setError(null);
    } else {
      setError("Failed to copy to clipboard");
    }
    return success;
  }, []);

  /**
   * Clear text
   */
  const clearText = useCallback(() => {
    setText(null);
    setError(null);
    setIsVisible(false);
  }, []);

  /**
   * Show panel
   */
  const showPanel = useCallback(async () => {
    // Try clipboard first (primary)
    const clipboardSuccess = await readFromClipboard();
    
    // If clipboard fails, try selection (secondary)
    if (!clipboardSuccess) {
      const selectionSuccess = readFromSelection();
      
      if (!selectionSuccess) {
        // No text available from either source
        setError("No text selected. Copy text (Ctrl/Cmd+C) then try again.");
        setIsVisible(true); // Show panel with error message
        return;
      }
    }

    setIsVisible(true);
  }, [readFromClipboard, readFromSelection]);

  /**
   * Hide panel
   */
  const hidePanel = useCallback(() => {
    setIsVisible(false);
  }, []);

  // Listen for clipboard changes (optional - for auto-detection)
  useEffect(() => {
    // Only check clipboard if panel is visible and we want to auto-update
    // This is disabled by default to avoid permission issues
    // User should explicitly trigger via hotkey
    
    return () => {
      if (clipboardCheckIntervalRef.current) {
        clearInterval(clipboardCheckIntervalRef.current);
      }
    };
  }, [isVisible]);

  return {
    text,
    hasText: !!text && text.text.trim().length > 0,
    isVisible,
    showPanel,
    hidePanel,
    style,
    setStyle,
    rewrittenText,
    isProcessing,
    readFromClipboard,
    readFromSelection,
    copyToClipboard,
    clearText,
    availableStyles: HELP_ME_WRITE_STYLES,
    error,
  };
}


