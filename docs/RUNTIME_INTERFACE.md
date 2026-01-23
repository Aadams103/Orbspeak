# SpeakOrb Runtime Interface

## Overview

The `SpeakOrbRuntime` provides a unified interface layer that prevents features from directly depending on internal modules. This creates a clean API boundary and prevents "feature kingdoms" from forming.

## Architecture

```
┌─────────────────────────────────────────┐
│         UI Components                   │
│  (App, Panels, Dialogs)                 │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│      SpeakOrbRuntime                    │
│  (Unified Interface Layer)              │
└─────────────────────────────────────────┘
              ↓ delegates to
┌─────────────────────────────────────────┐
│  Internal Modules (Hidden from UI)      │
│  • use-speech-recognition               │
│  • profile-learning-store               │
│  • text-processing                      │
│  • help-me-write                        │
│  • ORM layers                           │
└─────────────────────────────────────────┘
```

## API Surface

### Dictation State Events

```typescript
// Subscribe to state changes
const unsubscribe = runtime.subscribeToDictationState((state) => {
  console.log("Transcript:", state.transcript);
  console.log("Is listening:", state.isListening);
});

// Subscribe to lifecycle events
runtime.subscribeToDictationLifecycle((event) => {
  if (event.type === "started") {
    console.log("Dictation started");
  }
});

// Get current state
const state = runtime.getDictationState();
```

### Dictation Control

```typescript
// Start/stop dictation
runtime.startDictation("en-US");
runtime.stopDictation();
runtime.resetTranscript();

// Get transcript
const { final, interim } = runtime.getTranscript();
```

### Profile Management

```typescript
// Set current profile
await runtime.setCurrentProfile(profileId);

// Get current profile
const profile = runtime.getCurrentProfile();
// Returns: { id, name, isActive, dictionaryEntryCount }

// List all profiles
const profiles = runtime.listProfiles();

// Subscribe to profile changes
runtime.subscribeToProfile((profile) => {
  console.log("Active profile:", profile?.name);
});
```

### Post-Processing Pipeline

```typescript
// Configure processing options
runtime.configurePostProcessing({
  removeFillers: true,
  enableShortcuts: true,
  applyDictionary: true,
  applyLearning: true,
});

// Update shortcuts and dictionary
runtime.updateShortcuts(shortcuts);
runtime.updateDictionaryEntries(entries);

// Process text through pipeline
const processed = runtime.processText(rawText);
// Applies: text processing → dictionary → learning store

// Record correction for learning
await runtime.recordCorrection(
  "there",
  "their",
  "context hint",
  false // alwaysReplace
);
```

### Help Me Write Service

```typescript
// Rewrite text
const rewritten = runtime.rewriteText(
  "hello there",
  "formal"
);

// Get available styles
const styles = runtime.getHelpMeWriteStyles();
```

## React Hook

For React components, use the hook:

```typescript
import { useSpeakOrbRuntime } from "@/hooks/use-speakorb-runtime";

function MyComponent() {
  const {
    dictationState,
    isDictating,
    transcript,
    startDictation,
    stopDictation,
    currentProfile,
    setCurrentProfile,
    processText,
    recordCorrection,
    rewriteText,
  } = useSpeakOrbRuntime();

  // Use runtime methods...
}
```

## Benefits

### 1. **Prevents Feature Kingdoms**
- Features depend on stable runtime interface
- Internal modules can be refactored without breaking features
- Clear API boundaries

### 2. **Centralized State Management**
- Single source of truth for dictation state
- Event-driven architecture
- Subscribers get notified of changes

### 3. **Easier Testing**
- Mock runtime interface for tests
- Features testable in isolation
- Runtime testable independently

### 4. **Future-Proof**
- Can swap internal implementations
- Can add new capabilities without breaking existing code
- Can version the API

## Migration Pattern

**Before (Direct Dependencies):**
```typescript
// ❌ Direct dependency on internal module
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { ProfileLearningStore } from "@/lib/profile-learning-store";

const speechRecognition = useSpeechRecognition();
const learningStore = new ProfileLearningStore();
```

**After (Runtime Interface):**
```typescript
// ✅ Depend on runtime interface
import { useSpeakOrbRuntime } from "@/hooks/use-speakorb-runtime";

const runtime = useSpeakOrbRuntime();
// All functionality accessed through runtime
```

## Initialization

```typescript
// In App component
const speechRecognition = useSpeechRecognition();
const runtime = getRuntime();

useEffect(() => {
  runtime.initialize(speechRecognition);
  runtime.setUserId("user-1");
}, [speechRecognition]);
```

## Event Flow

```
Dictation Engine
    ↓ (state change)
Runtime (publishes event)
    ↓ (notifies subscribers)
UI Components (react to change)
```

## Extension Points

New features should:
1. ✅ Use runtime interface
2. ✅ Subscribe to events
3. ✅ Call runtime methods
4. ❌ NOT directly import internal modules
5. ❌ NOT access internal state directly

## Example: Adding a New Feature

```typescript
// New feature: Grammar Checker
function GrammarChecker() {
  const runtime = useSpeakOrbRuntime();
  
  useEffect(() => {
    // Subscribe to transcript changes
    const unsubscribe = runtime.subscribeToDictationState((state) => {
      if (state.transcript) {
        const processed = runtime.processText(state.transcript);
        // Check grammar on processed text
        checkGrammar(processed);
      }
    });
    
    return unsubscribe;
  }, [runtime]);
  
  // Feature only depends on runtime, not internal modules
}
```

## Summary

The runtime interface provides:
- **Unified API** for all SpeakOrb capabilities
- **Event system** for reactive updates
- **Clean boundaries** between UI and internals
- **Future-proof** architecture for evolution

All features should depend on `SpeakOrbRuntime`, not internal modules.


