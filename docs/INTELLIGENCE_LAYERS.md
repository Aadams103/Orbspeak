# Intelligence Layers Overview

## Quick Reference

### Current Stack

```
┌─────────────────────────────────────────────┐
│  Help Me Write                             │
│  • Global text selection                   │
│  • Style-based rewriting                   │
│  • Independent of dictation                │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Profile Learning Store                     │
│  • Automatic correction learning            │
│  • Confidence-based application             │
│  • Per-profile patterns                     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Personal Dictionary                       │
│  • User-defined replacements               │
│  • Always-replace rules                     │
│  • Priority-based ordering                  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Text Processing                           │
│  • Filler word removal                     │
│  • Voice shortcuts                          │
│  • Command handling                         │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│  STABLE DICTATION CORE                     │
│  (Immutable)                                │
└─────────────────────────────────────────────┘
```

---

## Layer Details

### 1. Text Processing (`text-processing.ts`)
- **Type:** Basic transformation
- **Input:** Raw transcript
- **Output:** Cleaned text
- **Features:** Fillers, shortcuts, commands
- **State:** Stateless functions

### 2. Personal Dictionary (`orm_personal_dictionary_entry`)
- **Type:** Rule-based replacement
- **Input:** Processed text
- **Output:** Dictionary-corrected text
- **Features:** User rules, always-replace
- **State:** Persistent (IndexedDB)

### 3. Profile Learning Store (`profile-learning-store.ts`)
- **Type:** Machine learning (pattern-based)
- **Input:** Dictionary-corrected text
- **Output:** Learned-corrections applied
- **Features:** Auto-learning, confidence scoring
- **State:** Persistent (IndexedDB) + in-memory cache

### 4. Help Me Write (`help-me-write.ts`)
- **Type:** Independent text rewriting
- **Input:** Any selected text (not dictation)
- **Output:** Style-rewritten text
- **Features:** Global selection, multiple styles
- **State:** Stateless (triggered by selection)

---

## Data Flow

```
User speaks
    ↓
[Dictation Core] → Raw transcript
    ↓
[Text Processing] → Cleaned text
    ↓
[Personal Dictionary] → Dictionary-corrected text
    ↓
[Profile Learning Store] → Learned-corrections applied
    ↓
Final processed transcript → UI
```

**Parallel Flow (Independent):**
```
User selects text anywhere
    ↓
[Help Me Write] → Rewritten text
    ↓
Actions: Replace / Insert / Copy
```

---

## Extension Pattern

To add a new intelligence layer:

1. **Create service** in `src/lib/`
2. **Add to pipeline** in `processTranscript()`
3. **Hook into events** (optional) for learning
4. **Test independently** of other layers

**Example:**
```typescript
// New layer: Grammar Checker
const grammarLayer = new GrammarChecker();

// Add to pipeline
processed = grammarLayer.checkAndFix(processed);

// Hook into corrections (optional)
grammarLayer.learnFromCorrection(correction);
```

---

## Key Principles

1. **Core is immutable** - Never modify dictation engine
2. **Layers are composable** - Add/remove independently
3. **State is isolated** - Each layer manages its own state
4. **Events are subscribed** - Layers listen, don't control
5. **Processing is pure** - Text in, text out

---

## Performance

- **Synchronous layers:** Text processing, dictionary
- **Cached layers:** Learning store (in-memory cache)
- **Async boundaries:** Heavy operations don't block
- **Lazy loading:** Layers only active when needed

---

## Testing

Each layer can be tested independently:

```typescript
// Test text processing
expect(processTranscription("um hello")).toBe("hello");

// Test dictionary
expect(applyDictionaryCorrections("there")).toBe("their");

// Test learning store
expect(store.applyLearnedCorrections("there")).toBe("their");

// Test Help Me Write
expect(rewriteText("hello", "formal")).toBe("greetings");
```

---

## Future Layers (Ideas)

- **Grammar Checker** - Real-time grammar suggestions
- **Style Analyzer** - Tone and style detection
- **Context Awareness** - Domain-specific corrections
- **Multi-language** - Cross-language support
- **Voice Patterns** - Speaker-specific adaptations
- **Sentiment Analysis** - Emotional tone adjustment

All can be added without touching the core!


