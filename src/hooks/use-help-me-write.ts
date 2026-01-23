/**
 * Help Me Write Hook
 * 
 * A standalone hook for Help Me Write that works independently of dictation.
 * Listens to global text selection and provides actions for text rewriting.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  type HelpMeWriteStyle,
  processHelpMeWrite,
  HELP_ME_WRITE_STYLES,
} from "@/lib/help-me-write";

export interface TextSelection {
  text: string;
  range: Range | null;
  element: HTMLElement | null;
  startOffset: number;
  endOffset: number;
}

export interface UseHelpMeWriteReturn {
  selectedText: TextSelection | null;
  isActive: boolean;
  style: HelpMeWriteStyle;
  setStyle: (style: HelpMeWriteStyle) => void;
  rewrittenText: string;
  isProcessing: boolean;
  showPanel: boolean;
  setShowPanel: (show: boolean) => void;
  replaceSelection: (newText: string) => void;
  insertAfterSelection: (newText: string) => void;
  copyToClipboard: (text: string) => Promise<void>;
  clearSelection: () => void;
  availableStyles: typeof HELP_ME_WRITE_STYLES;
}

/**
 * Hook for Help Me Write functionality
 * Listens to global text selection and provides rewriting actions
 */
export function useHelpMeWrite(): UseHelpMeWriteReturn {
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [style, setStyle] = useState<HelpMeWriteStyle>("formal");
  const [rewrittenText, setRewrittenText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const selectionRef = useRef<TextSelection | null>(null);

  // Process text when selection or style changes
  useEffect(() => {
    if (selectedText && selectedText.text.trim()) {
      setIsProcessing(true);
      
      // Simulate processing delay for better UX
      const timer = setTimeout(() => {
        const result = processHelpMeWrite(selectedText.text, { style });
        setRewrittenText(result.rewrittenText);
        setIsProcessing(false);
      }, 200);

      return () => clearTimeout(timer);
    } else {
      setRewrittenText("");
      setIsProcessing(false);
    }
  }, [selectedText, style]);

  // Listen to global text selection
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      
      if (!selection || selection.rangeCount === 0) {
        if (selectedText) {
          // Keep selection if panel is open
          if (!showPanel) {
            setSelectedText(null);
            setIsActive(false);
            selectionRef.current = null;
          }
        }
        return;
      }

      const text = selection.toString().trim();
      
      if (text.length === 0) {
        if (!showPanel) {
          setSelectedText(null);
          setIsActive(false);
          selectionRef.current = null;
        }
        return;
      }

      // Minimum text length to activate
      if (text.length < 3) {
        return;
      }

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element =
        container.nodeType === Node.TEXT_NODE
          ? (container.parentElement as HTMLElement)
          : (container as HTMLElement);

      // Check if selection is in an editable element or contenteditable
      const isEditable =
        element.isContentEditable ||
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.closest("[contenteditable]") !== null;

      // Store selection info
      const textSelection: TextSelection = {
        text,
        range: range.cloneRange(),
        element: isEditable ? element : null,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
      };

      setSelectedText(textSelection);
      setIsActive(true);
      selectionRef.current = textSelection;
    };

    // Listen to selection changes
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("keyup", handleSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mouseup", handleSelectionChange);
      document.removeEventListener("keyup", handleSelectionChange);
    };
  }, [selectedText, showPanel]);

  // Replace selected text with rewritten version
  const replaceSelection = useCallback(
    (newText: string) => {
      if (!selectionRef.current) return;

      const { element, range, startOffset, endOffset } = selectionRef.current;

      try {
        if (element) {
          // Try to replace in editable element
          if (element.isContentEditable) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              selection.deleteContents();
              selection.getRangeAt(0).insertNode(document.createTextNode(newText));
            }
          } else if (
            element.tagName === "INPUT" ||
            element.tagName === "TEXTAREA"
          ) {
            const input = element as HTMLInputElement | HTMLTextAreaElement;
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            const value = input.value;
            input.value = value.slice(0, start) + newText + value.slice(end);
            input.setSelectionRange(start, start + newText.length);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } else if (range) {
          // Fallback: try to replace via range
          range.deleteContents();
          range.insertNode(document.createTextNode(newText));
        }

        // Clear selection
        setSelectedText(null);
        setIsActive(false);
        setShowPanel(false);
        selectionRef.current = null;
      } catch (error) {
        console.error("Failed to replace selection:", error);
        // Fallback to clipboard
        copyToClipboard(newText);
      }
    },
    []
  );

  // Insert text after selection
  const insertAfterSelection = useCallback(
    (newText: string) => {
      if (!selectionRef.current) return;

      const { element, range, endOffset } = selectionRef.current;

      try {
        if (element) {
          if (element.isContentEditable) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const currentRange = selection.getRangeAt(0);
              currentRange.collapse(false); // Collapse to end
              currentRange.insertNode(document.createTextNode("\n\n" + newText));
            }
          } else if (
            element.tagName === "INPUT" ||
            element.tagName === "TEXTAREA"
          ) {
            const input = element as HTMLInputElement | HTMLTextAreaElement;
            const end = input.selectionEnd || 0;
            const value = input.value;
            input.value = value.slice(0, end) + "\n\n" + newText + value.slice(end);
            input.setSelectionRange(end + 2, end + 2 + newText.length);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } else if (range) {
          range.collapse(false);
          range.insertNode(document.createTextNode("\n\n" + newText));
        }

        // Clear selection
        setSelectedText(null);
        setIsActive(false);
        setShowPanel(false);
        selectionRef.current = null;
      } catch (error) {
        console.error("Failed to insert after selection:", error);
      }
    },
    []
  );

  // Copy text to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedText(null);
    setIsActive(false);
    setShowPanel(false);
    selectionRef.current = null;
    
    // Clear browser selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }, []);

  return {
    selectedText,
    isActive,
    style,
    setStyle,
    rewrittenText,
    isProcessing,
    showPanel,
    setShowPanel,
    replaceSelection,
    insertAfterSelection,
    copyToClipboard,
    clearSelection,
    availableStyles: HELP_ME_WRITE_STYLES,
  };
}


