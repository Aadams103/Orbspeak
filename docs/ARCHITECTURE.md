# SpeakOrb Architecture: Stable Core + Evolving Intelligence

## Core Principle

**The dictation engine is immutable.** All intelligence and learning features are built as **post-processing layers** that operate on the dictation output, never modifying the core recognition logic.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│              Evolving Intelligence Layers                │
│  (Can be modified, extended, replaced independently)     │
├─────────────────────────────────────────────────────────┤
│  • Help Me Write (text selection pipeline)              │
│  • Profile Learning Store (correction learning)         │
│  • Personal Dictionary (word replacements)              │
│  • Text Processing (filler removal, shortcuts)          │
│  • Voice Shortcuts (phrase expansions)                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Post-Processing Pipeline                    │
│  (processTranscript callback - extension point)          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│           STABLE DICTATION CORE                         │
│           (DO NOT MODIFY)                                │
├─────────────────────────────────────────────────────────┤
│  • use-speech-recognition.ts                             │
│  • Web Speech API integration                            │
│  • Recognition event handlers                            │
│  • Transcript accumulation                              │
│  • Error handling                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Stable Dictation Core

**Location:** `src/hooks/use-speech-recognition.ts`

**Responsibilities:**
- Web Speech API integration (`SpeechRecognition` / `webkitSpeechRecognition`)
- Recognition lifecycle management (start/stop/reset)
- Transcript accumulation (final + interim)
- Error handling and recovery
- Language configuration
- Demo mode for testing

**State Interface:**
```typescript
interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;           // Final transcript
  interimTranscript: string;    // Live interim results
  error: string | null;
  isSupported: boolean;
  language: string;
  isDemoMode: boolean;
}
```

**API Surface:**
```typescript
{
  state: SpeechRecognitionState;
  startListening: (language?: string) => void;
  stopListening: () => void;
  resetTranscript: () => void;
  setLanguage: (language: string) => void;
  simulateInput: (text: string) => void;  // Demo mode
  startDemoMode: () => void;
  stopDemoMode: () => void;
}
```

**Non-negotiable constraint:** This module must never be modified, refactored, or reimplemented.

---

## Evolving Intelligence Layers

### Layer 1: Text Processing Pipeline

**Location:** `src/lib/text-processing.ts`

**Purpose:** Basic text cleaning and transformation

**Features:**
- Filler word removal
- Stutter removal
- Voice command handling (punctuation)
- Voice shortcut expansion
- Number formatting

**Integration Point:** Called from `processTranscript()` callback

**Extension Pattern:**
```typescript
const processTranscript = useCallback((text: string) => {
  // 1. Basic processing
  const result = processTranscription(text, shortcuts, options);
  
  // 2. Dictionary corrections
  let processed = applyDictionaryCorrections(result.text);
  
  // 3. Learning store corrections (NEW LAYER)
  if (learningStoreRef.current) {
    processed = learningStoreRef.current.applyLearnedCorrections(processed);
  }
  
  // 4. Future layers can be added here...
  
  setProcessedTranscript(processed);
}, [dependencies]);
```

---

### Layer 2: Personal Dictionary

**Location:** `src/components/data/orm/orm_personal_dictionary_entry.ts`

**Purpose:** User-defined word/phrase replacements

**Features:**
- Per-profile dictionary entries
- Always-replace rules
- Pronunciation hints
- Priority-based ordering

**Integration Point:** `applyDictionaryCorrections()` function

**Data Model:**
```typescript
interface PersonalDictionaryEntryModel {
  original_text: string;
  replacement_text: string;
  is_always_replace: boolean;
  pronunciation_hint?: string;
  priority: number;
  entry_type: 'word' | 'phrase' | 'spelling' | 'casing';
}
```

---

### Layer 3: Profile Learning Store

**Location:** `src/lib/profile-learning-store.ts`

**Purpose:** Automatic learning from user corrections

**Features:**
- Tracks correction patterns per profile
- Builds confidence scores
- Applies learned corrections automatically
- Persists to IndexedDB via ORM

**Integration Points:**
1. **Post-processing:** `applyLearnedCorrections(text)` in pipeline
2. **Learning:** `recordCorrection()` when user makes manual corrections
3. **Cache refresh:** Auto-refreshes when dictionary updated

**Learning Algorithm:**
- Frequency tracking (how often correction is made)
- Confidence calculation (based on frequency, recency, user preference)
- Pattern matching (word/phrase level)
- Context awareness (pronunciation hints)

**Example:**
```typescript
// User corrects "there" → "their" 3 times
// Learning store learns: "there" → "their" (confidence: 0.8)
// Future dictation: "there" automatically becomes "their"
```

---

### Layer 4: Help Me Write

**Location:** `src/lib/help-me-write.ts` + `src/hooks/use-help-me-write.ts`

**Purpose:** Text rewriting for any selected text (independent of dictation)

**Features:**
- Global text selection detection
- Style-based rewriting (formal, casual, creative, literary)
- Works on any page content (not just transcript)
- Editable element detection

**Architecture:**
- **Completely independent** of dictation
- Listens to global `selectionchange` events
- Provides actions: replace, insert, copy
- Floating UI component

**Extension Pattern:**
```typescript
// Can be extended with:
// - AI-powered rewriting (replace rewriteText function)
// - Custom styles
// - Context-aware suggestions
// - Multi-language support
```

---

## Extension Points

### 1. Post-Processing Pipeline

**Location:** `src/routes/index.tsx` → `processTranscript()`

**How to Add a New Layer:**
```typescript
const processTranscript = useCallback((text: string) => {
  // Existing layers...
  let processed = applyDictionaryCorrections(text);
  processed = learningStore.applyLearnedCorrections(processed);
  
  // NEW LAYER - Add here
  processed = myNewIntelligenceLayer.process(processed);
  
  setProcessedTranscript(processed);
}, [dependencies]);
```

**Requirements:**
- Must be a pure function or stateless service
- Input: `string` (text)
- Output: `string` (processed text)
- Should not modify dictation state
- Can be async (use `useEffect` to handle)

---

### 2. Correction Learning

**Location:** `src/routes/index.tsx` → `handleWordCorrection()` / `handleTrainWord()`

**How to Add Learning:**
```typescript
const handleWordCorrection = useCallback((wordIndex: number, newWord: string) => {
  // Existing correction logic...
  
  // NEW LEARNING - Record correction
  if (myLearningService) {
    myLearningService.recordCorrection(originalWord, newWord, context);
  }
}, [dependencies]);
```

---

### 3. Global Event Listeners

**Location:** Any hook or component

**How to Add Global Intelligence:**
```typescript
// Example: Grammar checking layer
useEffect(() => {
  const handleTranscriptUpdate = (text: string) => {
    const suggestions = grammarChecker.check(text);
    // Show suggestions in UI
  };
  
  // Subscribe to transcript updates
  // (via existing state events)
}, []);
```

---

## State Event Subscription

All intelligence layers can subscribe to dictation state events:

```typescript
// Available state events:
speechRecognition.state.isListening    // Boolean
speechRecognition.state.transcript      // Final transcript
speechRecognition.state.interimTranscript  // Live results
speechRecognition.state.error           // Error messages
speechRecognition.state.language        // Current language

// App-level state:
isDictating                            // Session active
rawTranscript                          // Before processing
processedTranscript                    // After processing
sessionStartTime                       // Timestamp
```

**Subscription Pattern:**
```typescript
useEffect(() => {
  const text = speechRecognition.state.transcript;
  if (text) {
    myIntelligenceLayer.process(text);
  }
}, [speechRecognition.state.transcript]);
```

---

## Adding a New Intelligence Layer

### Step 1: Create the Service

```typescript
// src/lib/my-intelligence-layer.ts
export class MyIntelligenceLayer {
  process(text: string): string {
    // Your intelligence logic
    return processedText;
  }
  
  async learn(correction: Correction) {
    // Learning logic
  }
}
```

### Step 2: Integrate into Pipeline

```typescript
// src/routes/index.tsx
const myLayerRef = useRef(new MyIntelligenceLayer());

const processTranscript = useCallback((text: string) => {
  // ... existing processing
  processed = myLayerRef.current.process(processed);
  setProcessedTranscript(processed);
}, [dependencies]);
```

### Step 3: Hook into Events (Optional)

```typescript
// Subscribe to corrections
const handleWordCorrection = useCallback((...args) => {
  // ... existing logic
  myLayerRef.current.learn(correction);
}, []);
```

---

## Design Principles

### 1. **Separation of Concerns**
- Core dictation: Speech → Text conversion only
- Intelligence layers: Text → Better text transformation

### 2. **Composability**
- Layers can be added/removed independently
- Each layer operates on text, not dictation state
- Layers can be chained in any order

### 3. **Extensibility**
- New layers don't require core changes
- Layers can be toggled on/off
- Layers can be profile-specific

### 4. **Testability**
- Each layer can be tested independently
- Core dictation can be tested in isolation
- Mock data flows through pipeline easily

### 5. **Performance**
- Layers are synchronous where possible
- Async operations don't block dictation
- Caching at layer boundaries

---

## Current Intelligence Stack

1. **Text Processing** (basic cleaning)
2. **Personal Dictionary** (user-defined rules)
3. **Profile Learning Store** (automatic learning)
4. **Help Me Write** (independent text rewriting)

**Future Layers (Examples):**
- Grammar checking
- Style suggestions
- Context-aware corrections
- Multi-language support
- Voice pattern recognition
- Sentiment analysis
- Content categorization

---

## Migration Guide

When adding a new intelligence feature:

✅ **DO:**
- Create a new service/module
- Integrate via `processTranscript` callback
- Subscribe to existing state events
- Use existing ORM for persistence
- Follow the extension point patterns

❌ **DON'T:**
- Modify `use-speech-recognition.ts`
- Change recognition event handlers
- Add state to dictation core
- Couple intelligence to recognition lifecycle
- Break existing layer interfaces

---

## Testing Strategy

### Unit Tests
- Each layer tested independently
- Mock input/output for pipeline testing
- Core dictation tested with mock Speech API

### Integration Tests
- Pipeline composition (layers chained)
- State event propagation
- Profile-specific behavior

### E2E Tests
- Full dictation → processing → output flow
- User correction → learning → auto-correction
- Profile switching → layer activation

---

## Performance Considerations

- **Layers are lazy:** Only active layers process text
- **Caching:** Learning store caches patterns
- **Debouncing:** Text processing debounced in UI
- **Async boundaries:** Heavy operations async, don't block
- **Memory:** Layers clean up on profile switch

---

## Conclusion

This architecture provides:
- **Stability:** Core dictation never changes
- **Flexibility:** Intelligence layers evolve independently
- **Scalability:** Easy to add new layers
- **Maintainability:** Clear separation of concerns
- **Testability:** Each layer isolated and testable

The dictation core remains stable while intelligence capabilities evolve around it.


