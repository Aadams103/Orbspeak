/**
 * Clipboard Manager
 * 
 * Handles clipboard operations for Help Me Write feature.
 * Provides reliable text access via clipboard API.
 */

export class ClipboardManager {
  /**
   * Read text from clipboard
   */
  public static async readText(): Promise<string | null> {
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        console.warn("Clipboard API not available");
        return null;
      }

      const text = await navigator.clipboard.readText();
      return text.trim() || null;
    } catch (error) {
      // Clipboard might be empty or permission denied
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          console.warn("Clipboard permission denied");
        } else if (error.name === "NotFoundError") {
          console.warn("Clipboard is empty");
        }
      }
      return null;
    }
  }

  /**
   * Write text to clipboard
   */
  public static async writeText(text: string): Promise<boolean> {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        console.warn("Clipboard API not available");
        return false;
      }

      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error("Failed to write to clipboard:", error);
      return false;
    }
  }

  /**
   * Check if clipboard API is available
   */
  public static isAvailable(): boolean {
    return !!(
      navigator.clipboard &&
      navigator.clipboard.readText &&
      navigator.clipboard.writeText
    );
  }

  /**
   * Request clipboard permission (if needed)
   */
  public static async requestPermission(): Promise<boolean> {
    try {
      // Try to read clipboard to trigger permission request
      await navigator.clipboard.readText();
      return true;
    } catch (error) {
      // Permission denied or not available
      return false;
    }
  }
}


