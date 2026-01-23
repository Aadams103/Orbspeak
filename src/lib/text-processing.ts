/**
 * Text Processing Utilities for Flow Dictation
 *
 * Handles filler word removal, text cleaning, formatting,
 * and voice shortcut expansion.
 */

// Common filler words in English
const FILLER_WORDS = [
  "um",
  "uh",
  "umm",
  "uhh",
  "er",
  "err",
  "ah",
  "ahh",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "actually",
  "literally",
  "honestly",
  "right",
  "so",
  "well",
];

// Patterns to clean up repeated words/stutters
const STUTTER_PATTERN = /\b(\w+)\s+\1\b/gi;

// Patterns to clean up excessive punctuation
const EXCESS_PUNCTUATION = /([.!?])\1+/g;
const EXCESS_SPACES = /\s+/g;

export interface VoiceShortcut {
  trigger: string;
  expansion: string;
}

/**
 * Remove common filler words from transcribed text
 */
export function removeFillerWords(text: string): string {
  let cleaned = text;

  // Sort filler words by length (longest first) to avoid partial matches
  const sortedFillers = [...FILLER_WORDS].sort((a, b) => b.length - a.length);

  for (const filler of sortedFillers) {
    // Create a regex that matches the filler word with word boundaries
    // Handle multi-word fillers differently
    if (filler.includes(" ")) {
      const regex = new RegExp(`\\b${filler}\\b,?\\s*`, "gi");
      cleaned = cleaned.replace(regex, " ");
    } else {
      // For single words, be more careful about context
      // Only remove if followed by comma or at sentence boundaries
      const regex = new RegExp(`\\b${filler}\\b,?\\s*`, "gi");
      cleaned = cleaned.replace(regex, (match, offset) => {
        // Keep "so" at the beginning of sentences or if it seems intentional
        if (filler === "so" || filler === "well" || filler === "right") {
          const beforeChar = cleaned[offset - 1];
          if (beforeChar === "." || beforeChar === "!" || beforeChar === "?" || offset === 0) {
            return match; // Keep it - likely intentional
          }
        }
        return " ";
      });
    }
  }

  return cleaned.trim();
}

/**
 * Remove stutters and repeated words
 */
export function removeStutters(text: string): string {
  // Remove repeated words (e.g., "the the" -> "the")
  let cleaned = text.replace(STUTTER_PATTERN, "$1");

  // Handle word fragments that might be stutters (e.g., "I I I want" -> "I want")
  cleaned = cleaned.replace(/\b(\w+)(\s+\1)+\b/gi, "$1");

  return cleaned;
}

/**
 * Clean up and format transcribed text
 */
export function cleanTranscription(text: string): string {
  let cleaned = text;

  // Remove filler words
  cleaned = removeFillerWords(cleaned);

  // Remove stutters
  cleaned = removeStutters(cleaned);

  // Clean up excessive punctuation
  cleaned = cleaned.replace(EXCESS_PUNCTUATION, "$1");

  // Clean up excessive spaces
  cleaned = cleaned.replace(EXCESS_SPACES, " ");

  // Capitalize first letter of sentences
  cleaned = capitalizeSentences(cleaned);

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Capitalize the first letter of each sentence
 */
export function capitalizeSentences(text: string): string {
  // Split by sentence boundaries
  const sentences = text.split(/([.!?]+\s*)/);

  return sentences
    .map((part, index) => {
      // Even indices are sentences, odd indices are punctuation
      if (index % 2 === 0 && part.length > 0) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part;
    })
    .join("");
}

/**
 * Apply voice shortcuts to text
 * Replaces trigger phrases with their expansions
 */
export function applyShortcuts(
  text: string,
  shortcuts: VoiceShortcut[]
): { text: string; appliedShortcuts: string[] } {
  let result = text;
  const appliedShortcuts: string[] = [];

  // Sort shortcuts by trigger length (longest first) to handle overlapping triggers
  const sortedShortcuts = [...shortcuts].sort(
    (a, b) => b.trigger.length - a.trigger.length
  );

  for (const shortcut of sortedShortcuts) {
    const regex = new RegExp(`\\b${escapeRegex(shortcut.trigger)}\\b`, "gi");
    if (regex.test(result)) {
      result = result.replace(regex, shortcut.expansion);
      appliedShortcuts.push(shortcut.trigger);
    }
  }

  return { text: result, appliedShortcuts };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Format numbers spoken as words to digits
 * e.g., "one hundred twenty three" -> "123"
 */
export function formatSpokenNumbers(text: string): string {
  const numberWords: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4,
    five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
    forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
    million: 1000000, billion: 1000000000,
  };

  let result = text;

  // Handle simple cases like "twenty one" -> "21"
  for (const [word, value] of Object.entries(numberWords)) {
    if (value >= 20 && value < 100) {
      // Handle compound numbers like "twenty one"
      for (let i = 1; i <= 9; i++) {
        const numWord = Object.entries(numberWords).find(([, v]) => v === i)?.[0];
        if (numWord) {
          const pattern = new RegExp(`\\b${word}\\s+${numWord}\\b`, "gi");
          result = result.replace(pattern, String(value + i));
        }
      }
    }
  }

  // Handle standalone number words
  for (const [word, value] of Object.entries(numberWords)) {
    if (value <= 19) {
      const pattern = new RegExp(`\\b${word}\\b`, "gi");
      result = result.replace(pattern, String(value));
    }
  }

  return result;
}

/**
 * Handle voice commands for punctuation
 */
export function handleVoiceCommands(text: string): string {
  const commands: Record<string, string> = {
    "period": ".",
    "full stop": ".",
    "comma": ",",
    "question mark": "?",
    "exclamation mark": "!",
    "exclamation point": "!",
    "colon": ":",
    "semicolon": ";",
    "open quote": '"',
    "close quote": '"',
    "open parenthesis": "(",
    "close parenthesis": ")",
    "new line": "\n",
    "new paragraph": "\n\n",
    "dash": "-",
    "hyphen": "-",
  };

  let result = text;

  for (const [command, replacement] of Object.entries(commands)) {
    const pattern = new RegExp(`\\s*${escapeRegex(command)}\\s*`, "gi");
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Full text processing pipeline
 */
export function processTranscription(
  text: string,
  shortcuts: VoiceShortcut[] = [],
  options: {
    removeFillers?: boolean;
    handleCommands?: boolean;
    formatNumbers?: boolean;
    applyShortcuts?: boolean;
  } = {}
): { text: string; appliedShortcuts: string[] } {
  const {
    removeFillers = true,
    handleCommands = true,
    formatNumbers = false,
    applyShortcuts: shouldApplyShortcuts = true,
  } = options;

  let processed = text;
  let appliedShortcuts: string[] = [];

  // Handle voice commands for punctuation
  if (handleCommands) {
    processed = handleVoiceCommands(processed);
  }

  // Format spoken numbers
  if (formatNumbers) {
    processed = formatSpokenNumbers(processed);
  }

  // Apply shortcuts
  if (shouldApplyShortcuts && shortcuts.length > 0) {
    const result = applyShortcuts(processed, shortcuts);
    processed = result.text;
    appliedShortcuts = result.appliedShortcuts;
  }

  // Clean up the transcription (filler words, stutters, formatting)
  if (removeFillers) {
    processed = cleanTranscription(processed);
  }

  return { text: processed, appliedShortcuts };
}

/**
 * Supported languages for speech recognition
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "en-AU", name: "English (Australia)" },
  { code: "es-ES", name: "Spanish (Spain)" },
  { code: "es-MX", name: "Spanish (Mexico)" },
  { code: "fr-FR", name: "French (France)" },
  { code: "de-DE", name: "German" },
  { code: "it-IT", name: "Italian" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "pt-PT", name: "Portuguese (Portugal)" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "zh-TW", name: "Chinese (Traditional)" },
  { code: "ja-JP", name: "Japanese" },
  { code: "ko-KR", name: "Korean" },
  { code: "ru-RU", name: "Russian" },
  { code: "ar-SA", name: "Arabic" },
  { code: "hi-IN", name: "Hindi" },
  { code: "nl-NL", name: "Dutch" },
  { code: "pl-PL", name: "Polish" },
  { code: "sv-SE", name: "Swedish" },
];
