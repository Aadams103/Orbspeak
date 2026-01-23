# Orb Positioning and Focus Management

## Overview

The SpeakOrb floating orb is designed to work reliably across real-world conditions:
- Multi-monitor setups
- DPI scaling changes
- Window resizing
- Focus management
- Always-on-top behavior

## Architecture

```
┌─────────────────────────────────────────┐
│      OrbPositionManager                  │
│  (Multi-monitor + DPI + Validation)     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│      FocusManager                        │
│  (Prevent focus stealing)                │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│      SpeakOrb Component                  │
│  (UI + Interaction)                      │
└─────────────────────────────────────────┘
```

## Features

### 1. Multi-Monitor Support

**Problem**: Position saved on one monitor becomes invalid when window moves to another monitor.

**Solution**: Store position with monitor ID and validate on load.

```typescript
interface OrbPosition {
  x: number;
  y: number;
  monitorId?: string;  // Identifies which monitor
  dpiScale?: number;   // DPI when saved
}
```

**How it works**:
- Generate unique screen ID based on screen bounds and DPI
- Save position with screen context
- On load, check if position is for current screen
- If different screen, use default position for current screen

### 2. DPI Scaling Awareness

**Problem**: Position saved at one DPI scale becomes incorrect when DPI changes.

**Solution**: Store DPI scale and adjust position when loading.

```typescript
// Save with DPI
const position = {
  x: 100,
  y: 100,
  dpiScale: 1.5,  // Saved at 150% DPI
};

// Load and adjust
if (currentDpiScale !== savedDpiScale) {
  const scaleRatio = currentDpiScale / savedDpiScale;
  adjustedX = savedX * scaleRatio;
  adjustedY = savedY * scaleRatio;
}
```

### 3. Off-Screen Detection

**Problem**: Saved position might be off-screen after window resize or monitor disconnect.

**Solution**: Validate position and provide safe fallback.

```typescript
// Check if position is within screen bounds
const isOnScreen = 
  x >= screenBounds.x &&
  y >= screenBounds.y &&
  x + orbSize <= screenBounds.x + screenBounds.width &&
  y + orbSize <= screenBounds.y + screenBounds.height;

// If off-screen, use default position
if (!isOnScreen) {
  return getDefaultPosition(); // Bottom-right with padding
}
```

### 4. Focus Stealing Prevention

**Problem**: Orb interactions steal focus from user's current work.

**Solution**: Save and restore focus around interactions.

```typescript
// Before interaction
FocusManager.saveFocus();

// Perform interaction
handleOrbClick();

// Restore focus (if not actively interacting)
if (!FocusManager.isInteracting()) {
  FocusManager.restoreFocus();
}
```

### 5. Always-On-Top Reliability

**Problem**: Orb might not be visible over fullscreen apps.

**Solution**: Use high z-index and ensure pointer events.

```typescript
<div
  className="fixed z-50"
  style={{
    pointerEvents: "auto",  // Ensure clickable
    tabIndex: -1,            // Prevent focus
  }}
>
```

### 6. Keyboard Shortcut Conflicts

**Problem**: Shortcuts might conflict with user's typing.

**Solution**: Only handle shortcuts when not in input fields.

```typescript
const isInputElement =
  target.tagName === "INPUT" ||
  target.tagName === "TEXTAREA" ||
  target.isContentEditable;

if (isInputElement) {
  return false; // Don't handle, let user type
}
```

## Usage

### Position Management

```typescript
// Load position (with validation)
const position = OrbPositionManager.loadPosition();

// Save position (with screen context)
OrbPositionManager.savePosition(position);

// Validate position (check if on-screen)
const validated = OrbPositionManager.validatePosition(position);

// Constrain to screen bounds
const constrained = OrbPositionManager.constrainPosition(position);

// Handle window resize
const adjusted = OrbPositionManager.handleResize(position);
```

### Focus Management

```typescript
// Save focus before interaction
FocusManager.saveFocus();

// Perform update
updateOrbUI();

// Restore focus
FocusManager.restoreFocus();

// Handle keyboard shortcut
FocusManager.handleKeyboardShortcut(event, () => {
  // Handle shortcut
});

// Prevent focus stealing
FocusManager.preventFocusStealing(() => {
  // Update UI
});
```

## Edge Cases Handled

### 1. Window Resize

```typescript
useEffect(() => {
  const handleResize = () => {
    setOrbPosition((current) => {
      return OrbPositionManager.handleResize(current);
    });
  };

  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);
```

### 2. Screen Change (Multi-Monitor)

```typescript
useEffect(() => {
  const handleScreenChange = () => {
    setOrbPosition((current) => {
      return OrbPositionManager.handleScreenChange(current);
    });
  };

  // Check periodically
  const interval = setInterval(() => {
    if (OrbPositionManager.needsValidation(orbPosition)) {
      handleScreenChange();
    }
  }, 1000);

  window.addEventListener("focus", handleScreenChange);
  return () => {
    clearInterval(interval);
    window.removeEventListener("focus", handleScreenChange);
  };
}, [orbPosition]);
```

### 3. App Start/Quit

**On Start**:
- Load position from storage
- Validate position (check if on-screen)
- Use fallback if invalid

**On Quit**:
- Position is auto-saved on change
- No special handling needed

### 4. DPI Change

```typescript
// Position saved at 100% DPI: { x: 100, y: 100, dpiScale: 1.0 }
// User changes to 150% DPI
// Position automatically adjusted: { x: 150, y: 150, dpiScale: 1.5 }
```

## Storage Format

```typescript
{
  version: 1,
  position: {
    x: 100,
    y: 100,
    monitorId: "0-0-1920-1080-1.0",
    dpiScale: 1.0
  },
  savedAt: 1234567890
}
```

## Testing Checklist

- [ ] Multi-monitor: Move window between monitors
- [ ] DPI scaling: Change DPI, verify position adjusts
- [ ] Window resize: Resize window, verify orb stays on-screen
- [ ] Focus: Click orb, verify focus not stolen
- [ ] Keyboard shortcuts: Type in input, verify shortcuts don't trigger
- [ ] Off-screen: Disconnect monitor, verify fallback position
- [ ] Always-on-top: Fullscreen app, verify orb visible
- [ ] App start: Close and reopen, verify position restored

## Best Practices

1. **Always validate position on load**
   ```typescript
   const position = OrbPositionManager.validatePosition(savedPosition);
   ```

2. **Constrain during drag**
   ```typescript
   const constrained = OrbPositionManager.constrainPosition(newPosition);
   ```

3. **Save focus before interactions**
   ```typescript
   FocusManager.saveFocus();
   // ... interaction ...
   ```

4. **Check input elements before shortcuts**
   ```typescript
   if (isInputElement) return false;
   ```

5. **Use fallback for invalid positions**
   ```typescript
   if (!isValid) return getDefaultPosition();
   ```

## Summary

- ✅ **Multi-monitor**: Position stored per monitor with ID
- ✅ **DPI scaling**: Position adjusted based on DPI changes
- ✅ **Off-screen detection**: Validates and provides fallback
- ✅ **Focus management**: Prevents unnecessary focus stealing
- ✅ **Always-on-top**: High z-index with pointer events
- ✅ **Keyboard shortcuts**: Only handle when not in input
- ✅ **Edge cases**: Handles resize, screen change, app start/quit


