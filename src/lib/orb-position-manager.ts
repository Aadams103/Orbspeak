/**
 * Orb Position Manager
 * 
 * Handles robust positioning for the SpeakOrb floating orb across:
 * - Multi-monitor setups
 * - DPI scaling
 * - Window resizing
 * - Off-screen detection and recovery
 * - Focus stealing prevention
 * 
 * Design:
 * - Stores position per monitor (using screen ID)
 * - Accounts for DPI scaling
 * - Validates position on load
 * - Provides safe fallback if position is invalid
 */

export interface OrbPosition {
  x: number;
  y: number;
  monitorId?: string; // Identifier for the monitor
  dpiScale?: number; // DPI scaling factor when saved
}

export interface ScreenInfo {
  id: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  dpiScale: number;
  isPrimary: boolean;
}

/**
 * Orb Position Manager
 * 
 * Manages orb position with multi-monitor and DPI awareness
 */
export class OrbPositionManager {
  private static readonly STORAGE_KEY = "speakorb-position";
  private static readonly STORAGE_VERSION = 1;
  private static readonly ORB_SIZE = 56; // 14 * 4 (w-14 h-14 in Tailwind)

  /**
   * Get current screen information
   */
  public static getScreenInfo(): ScreenInfo {
    // Get primary screen
    const primaryScreen = {
      x: window.screenX,
      y: window.screenY,
      width: window.screen.width,
      height: window.screen.height,
    };

    // Calculate DPI scale (devicePixelRatio)
    const dpiScale = window.devicePixelRatio || 1;

    // Generate screen ID based on position and size
    // This helps identify which monitor we're on
    const screenId = this.generateScreenId(primaryScreen, dpiScale);

    return {
      id: screenId,
      bounds: {
        x: primaryScreen.x,
        y: primaryScreen.y,
        width: primaryScreen.width,
        height: primaryScreen.height,
      },
      dpiScale,
      isPrimary: window.screenX === 0 && window.screenY === 0,
    };
  }

  /**
   * Generate a unique screen ID
   */
  private static generateScreenId(
    bounds: { x: number; y: number; width: number; height: number },
    dpiScale: number
  ): string {
    // Use screen position and size to create unique ID
    // This works for multi-monitor setups
    return `${bounds.x}-${bounds.y}-${bounds.width}-${bounds.height}-${dpiScale}`;
  }

  /**
   * Get all available screens (for multi-monitor support)
   */
  public static getAllScreens(): ScreenInfo[] {
    const screens: ScreenInfo[] = [];

    // Primary screen
    const primary = this.getScreenInfo();
    screens.push(primary);

    // Note: In browser, we can't directly enumerate all screens
    // But we can detect when window moves to a different screen
    // by comparing screen IDs

    return screens;
  }

  /**
   * Load saved position with validation
   */
  public static loadPosition(): OrbPosition {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) {
        return this.getDefaultPosition();
      }

      const parsed = JSON.parse(saved);
      
      // Check if it's the new format (with version)
      if (parsed.version === this.STORAGE_VERSION && parsed.position) {
        return this.validatePosition(parsed.position);
      }

      // Legacy format (just {x, y})
      if (parsed.x !== undefined && parsed.y !== undefined) {
        return this.validatePosition(parsed);
      }

      return this.getDefaultPosition();
    } catch (error) {
      console.warn("Failed to load orb position:", error);
      return this.getDefaultPosition();
    }
  }

  /**
   * Save position with screen context
   */
  public static savePosition(position: OrbPosition): void {
    try {
      const screenInfo = this.getScreenInfo();
      
      // Update position with current screen context
      const positionWithContext: OrbPosition = {
        ...position,
        monitorId: screenInfo.id,
        dpiScale: screenInfo.dpiScale,
      };

      const data = {
        version: this.STORAGE_VERSION,
        position: positionWithContext,
        savedAt: Date.now(),
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("Failed to save orb position:", error);
    }
  }

  /**
   * Validate position and provide fallback if off-screen
   */
  public static validatePosition(position: OrbPosition): OrbPosition {
    const screenInfo = this.getScreenInfo();
    const { bounds, dpiScale } = screenInfo;

    // Check if position is for a different screen
    const isDifferentScreen = position.monitorId && position.monitorId !== screenInfo.id;
    
    // Check if DPI scale changed significantly
    const dpiChanged = position.dpiScale && Math.abs(position.dpiScale - dpiScale) > 0.1;

    // Calculate effective position (account for DPI scaling)
    let effectiveX = position.x;
    let effectiveY = position.y;

    if (position.dpiScale && position.dpiScale !== dpiScale) {
      // Adjust for DPI change
      const scaleRatio = dpiScale / position.dpiScale;
      effectiveX = position.x * scaleRatio;
      effectiveY = position.y * scaleRatio;
    }

    // Check if position is within current screen bounds
    const isOnScreen = 
      effectiveX >= bounds.x &&
      effectiveY >= bounds.y &&
      effectiveX + this.ORB_SIZE <= bounds.x + bounds.width &&
      effectiveY + this.ORB_SIZE <= bounds.y + bounds.height;

    // If position is invalid, use fallback
    if (!isOnScreen || isDifferentScreen || dpiChanged) {
      console.log("Orb position invalid, using fallback:", {
        isOnScreen,
        isDifferentScreen,
        dpiChanged,
        savedPosition: position,
        currentScreen: screenInfo,
      });

      return this.getDefaultPosition();
    }

    // Position is valid, return it
    return {
      x: effectiveX,
      y: effectiveY,
      monitorId: screenInfo.id,
      dpiScale,
    };
  }

  /**
   * Get default position (safe fallback)
   */
  public static getDefaultPosition(): OrbPosition {
    const screenInfo = this.getScreenInfo();
    const { bounds } = screenInfo;

    // Default: bottom-right corner with padding
    const padding = 20;
    return {
      x: bounds.width - this.ORB_SIZE - padding,
      y: bounds.height - this.ORB_SIZE - padding,
      monitorId: screenInfo.id,
      dpiScale: screenInfo.dpiScale,
    };
  }

  /**
   * Constrain position to screen bounds
   */
  public static constrainPosition(position: OrbPosition): OrbPosition {
    const screenInfo = this.getScreenInfo();
    const { bounds } = screenInfo;

    const constrainedX = Math.max(
      bounds.x,
      Math.min(
        bounds.x + bounds.width - this.ORB_SIZE,
        position.x
      )
    );

    const constrainedY = Math.max(
      bounds.y,
      Math.min(
        bounds.y + bounds.height - this.ORB_SIZE,
        position.y
      )
    );

    return {
      x: constrainedX,
      y: constrainedY,
      monitorId: screenInfo.id,
      dpiScale: screenInfo.dpiScale,
    };
  }

  /**
   * Check if position needs validation (e.g., after window resize)
   */
  public static needsValidation(position: OrbPosition): boolean {
    const screenInfo = this.getScreenInfo();
    
    return (
      position.monitorId !== screenInfo.id ||
      (position.dpiScale && Math.abs(position.dpiScale - screenInfo.dpiScale) > 0.1)
    );
  }

  /**
   * Handle window resize - validate and adjust position
   */
  public static handleResize(currentPosition: OrbPosition): OrbPosition {
    const validated = this.validatePosition(currentPosition);
    return this.constrainPosition(validated);
  }

  /**
   * Handle screen change (multi-monitor)
   */
  public static handleScreenChange(currentPosition: OrbPosition): OrbPosition {
    const screenInfo = this.getScreenInfo();
    
    // If we're on a different screen, use default position for this screen
    if (currentPosition.monitorId && currentPosition.monitorId !== screenInfo.id) {
      return this.getDefaultPosition();
    }

    // Otherwise, validate and constrain
    return this.constrainPosition(currentPosition);
  }
}


