# Help Me Write - Clipboard-Based Implementation

## Overview

Help Me Write is a text rewriting feature that works reliably across all applications by using the clipboard as the primary method for text access. This avoids OS permission issues and makes the feature dependable.

## Architecture

```
User Action Flow:
1. User copies text (Ctrl/Cmd+C) anywhere
2. User presses hotkey (Ctrl/Cmd+Shift+H)
3. System reads from clipboard
4. Panel shows with rewritten text
5. User copies rewritten text back
```

## Primary Method: Clipboard

**Why Clipboard?**
- Works across all applications (browser, desktop apps, etc.)
- No permission issues (user explicitly copies)
- Reliable and consistent
- Works even when text selection API fails

**How it works:**
1. User copies text to clipboard (Ctrl/Cmd+C)
2. User presses hotkey (Ctrl/Cmd+Shift+H)
3. System reads from clipboard using `navigator.clipboard.readText()`
4. Text is processed and rewritten
5. User can copy rewritten text back

## Secondary Method: Selection (Fallback)

**When to use:**
- Only as a fallback if clipboard fails
- Only for text within the same page/app
- Not relied upon for cross-app functionality

**Limitations:**
- Only works within browser context
- May fail due to permissions
- Not available for external apps

## User Experience

### Clear Instructions

The panel shows clear feedback:

**When no text available:**
```
⚠️ No text selected. Copy text (Ctrl/Cmd+C) then try again.
```

**When clipboard is empty:**
```
⚠️ No text in clipboard. Copy some text first (Ctrl/Cmd+C), then try again.
```

**When text is too short:**
```
⚠️ Text is too short. Please copy at least 3 characters.
```

**When clipboard permission denied:**
```
⚠️ Failed to read clipboard. Please ensure clipboard permissions are granted.
```

### Workflow

1. **Copy Text**: User selects and copies text anywhere (Ctrl/Cmd+C)
2. **Trigger**: User presses hotkey (Ctrl/Cmd+Shift+H)
3. **Process**: System reads clipboard and rewrites text
4. **Review**: User sees original and rewritten text
5. **Use**: User copies rewritten text back to clipboard

## Implementation

### Clipboard Manager

```typescript
// Read from clipboard
const text = await ClipboardManager.readText();

// Write to clipboard
await ClipboardManager.writeText(text);

// Check availability
if (ClipboardManager.isAvailable()) {
  // Use clipboard
}
```

### Hook Usage

```typescript
const {
  text,
  hasText,
  isVisible,
  showPanel,
  hidePanel,
  style,
  setStyle,
  rewrittenText,
  readFromClipboard,
  copyToClipboard,
  error,
} = useHelpMeWriteClipboard();

// Trigger panel (reads from clipboard)
showPanel();

// Copy rewritten text
await copyToClipboard(rewrittenText);
```

### Keyboard Shortcut

```typescript
// Ctrl/Cmd + Shift + H
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      e.key.toLowerCase() === "h"
    ) {
      // Don't handle if user is typing
      const isInput = target.tagName === "INPUT" || 
                      target.tagName === "TEXTAREA";
      if (isInput) return;

      e.preventDefault();
      
      // Trigger panel
      window.dispatchEvent(new CustomEvent("help-me-write-trigger"));
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);
```

## Error Handling

### Clipboard Permission Denied

**Detection:**
```typescript
try {
  const text = await navigator.clipboard.readText();
} catch (error) {
  if (error.name === "NotAllowedError") {
    // Permission denied
  }
}
```

**User Message:**
```
Failed to read clipboard. Please ensure clipboard permissions are granted.
```

### Clipboard Empty

**Detection:**
```typescript
const text = await ClipboardManager.readText();
if (!text || text.trim().length === 0) {
  // Clipboard is empty
}
```

**User Message:**
```
No text in clipboard. Copy some text first (Ctrl/Cmd+C), then try again.
```

### Text Too Short

**Detection:**
```typescript
if (text.trim().length < 3) {
  // Text is too short
}
```

**User Message:**
```
Text is too short. Please copy at least 3 characters.
```

## Best Practices

### 1. Always Try Clipboard First

```typescript
// Primary: Clipboard
const clipboardSuccess = await readFromClipboard();

// Secondary: Selection (fallback only)
if (!clipboardSuccess) {
  const selectionSuccess = readFromSelection();
}
```

### 2. Provide Clear Feedback

```typescript
if (error) {
  return <Alert>{error}</Alert>;
}

if (!hasText) {
  return <Alert>No text selected. Copy text (Ctrl/Cmd+C) then try again.</Alert>;
}
```

### 3. Don't Steal Focus

```typescript
// Don't focus input fields
// Don't interrupt user's typing
// Only handle shortcuts when not in input
```

### 4. Handle Permissions Gracefully

```typescript
try {
  await ClipboardManager.requestPermission();
} catch {
  // Show helpful message
  setError("Clipboard permission required. Please grant permission in browser settings.");
}
```

## Testing Checklist

- [ ] Copy text from browser, trigger hotkey → works
- [ ] Copy text from external app, trigger hotkey → works
- [ ] Empty clipboard, trigger hotkey → shows error message
- [ ] Short text (< 3 chars), trigger hotkey → shows error message
- [ ] Permission denied → shows helpful message
- [ ] Typing in input, press hotkey → doesn't trigger
- [ ] Copy rewritten text → works
- [ ] Multiple styles → all work correctly

## Advantages Over Selection-Based

| Feature | Clipboard | Selection |
|---------|-----------|-----------|
| Cross-app | ✅ Yes | ❌ No |
| Permissions | ✅ User controls | ❌ May be denied |
| Reliability | ✅ High | ⚠️ Variable |
| User control | ✅ Explicit (copy) | ⚠️ Automatic |
| Works everywhere | ✅ Yes | ❌ Browser only |

## Summary

- ✅ **Primary Method**: Clipboard (Ctrl/Cmd+C then hotkey)
- ✅ **Secondary Method**: Selection (fallback only)
- ✅ **Clear UX**: Error messages guide user
- ✅ **No Permission Issues**: User explicitly copies
- ✅ **Works Everywhere**: Cross-app compatibility
- ✅ **Reliable**: Dependable text access


