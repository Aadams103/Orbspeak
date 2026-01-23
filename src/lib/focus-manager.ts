/**
 * Focus Manager
 * 
 * Prevents focus stealing and ensures orb remains interactable
 * without disrupting user workflow.
 * 
 * Features:
 * - Prevents unnecessary focus stealing
 * - Maintains always-on-top behavior
 * - Handles keyboard shortcut conflicts
 * - Manages focus state for accessibility
 */

/**
 * Focus Manager for SpeakOrb
 * 
 * Manages focus behavior to prevent stealing focus unnecessarily
 */
export class FocusManager {
  private static activeElement: HTMLElement | null = null;
  private static isOrbInteracting = false;

  /**
   * Save current focus before orb interaction
   */
  public static saveFocus(): void {
    if (document.activeElement instanceof HTMLElement) {
      this.activeElement = document.activeElement;
    }
  }

  /**
   * Restore focus after orb interaction
   */
  public static restoreFocus(): void {
    if (this.activeElement && document.contains(this.activeElement)) {
      // Only restore if element is still in DOM
      try {
        this.activeElement.focus();
      } catch (error) {
        // Element might not be focusable, ignore
        console.debug("Could not restore focus:", error);
      }
    }
    this.activeElement = null;
  }

  /**
   * Mark orb as interacting (prevents focus restoration)
   */
  public static setOrbInteracting(interacting: boolean): void {
    this.isOrbInteracting = interacting;
  }

  /**
   * Check if orb is currently interacting
   */
  public static isInteracting(): boolean {
    return this.isOrbInteracting;
  }

  /**
   * Update orb UI without stealing focus
   */
  public static updateOrbUI(updateFn: () => void): void {
    // Save current focus
    this.saveFocus();

    // Perform update
    updateFn();

    // Restore focus after a brief delay (allows React to render)
    setTimeout(() => {
      if (!this.isOrbInteracting) {
        this.restoreFocus();
      }
    }, 0);
  }

  /**
   * Handle keyboard shortcut without stealing focus
   */
  public static handleKeyboardShortcut(
    event: KeyboardEvent,
    handler: () => void
  ): boolean {
    // Check if shortcut should be handled
    // Only handle if not in an input/textarea/contenteditable
    const target = event.target as HTMLElement;
    const isInputElement =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;

    // If in input, don't handle (let user type)
    if (isInputElement) {
      return false;
    }

    // Save focus before handling
    this.saveFocus();

    // Handle shortcut
    handler();

    // Restore focus
    setTimeout(() => {
      if (!this.isOrbInteracting) {
        this.restoreFocus();
      }
    }, 0);

    return true;
  }

  /**
   * Ensure element is visible without stealing focus
   */
  public static ensureVisible(element: HTMLElement): void {
    // Check if element is in viewport
    const rect = element.getBoundingClientRect();
    const isVisible =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth;

    if (!isVisible) {
      // Scroll into view without focusing
      element.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }

  /**
   * Prevent focus stealing during updates
   */
  public static preventFocusStealing(callback: () => void): void {
    const savedFocus = document.activeElement;
    callback();

    // Restore focus if it was stolen
    if (document.activeElement !== savedFocus && savedFocus instanceof HTMLElement) {
      requestAnimationFrame(() => {
        if (document.contains(savedFocus)) {
          savedFocus.focus();
        }
      });
    }
  }
}


