/**
 * Post-Processing Pipeline (The "Truth Funnel")
 * 
 * A deterministic, ordered pipeline that processes raw dictation transcript
 * through multiple stages to produce the final processed text.
 * 
 * Pipeline Order:
 * 1. Phrase replacements (longest first, highest priority)
 * 2. Word replacements (priority-based)
 * 3. Casing/spelling preferences
 * 4. Punctuation normalization (optional)
 * 
 * Design Principles:
 * - Deterministic: Same input always produces same output
 * - Ordered: Stages execute in fixed order
 * - Loop-safe: Prevents replacements that re-trigger themselves
 * - Testable: Each stage can be tested independently
 */

import type { PersonalDictionaryEntryModel } from "@/components/data/orm/orm_personal_dictionary_entry";
import { PersonalDictionaryEntryEntryType } from "@/components/data/orm/orm_personal_dictionary_entry";
import { processTranscription, type VoiceShortcut } from "@/lib/text-processing";
import { ProfileLearningStore } from "@/lib/profile-learning-store";

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  profileId: string | null;
  dictionaryEntries: PersonalDictionaryEntryModel[];
  shortcuts: VoiceShortcut[];
  learningStore: ProfileLearningStore | null;
  options: {
    removeFillers?: boolean;
    enableShortcuts?: boolean;
    normalizePunctuation?: boolean;
  };
}

/**
 * Pipeline stage result
 */
interface StageResult {
  text: string;
  appliedRules: string[];
  iterations: number; // For loop detection
}

/**
 * Replacement rule for internal processing
 */
interface ReplacementRule {
  original: string;
  replacement: string;
  type: "phrase" | "word" | "spelling" | "casing";
  priority: number;
  id: string; // For tracking applied rules
}

/**
 * Post-Processing Pipeline
 * 
 * Processes raw transcript through ordered stages to produce final text.
 */
export class PostProcessingPipeline {
  private config: PipelineConfig;
  private maxIterations = 10; // Prevent infinite loops

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  /**
   * Main entry point: Process transcript through pipeline
   * 
   * @param rawText - Raw transcript from dictation engine
   * @param profileId - Current profile ID (for learning store)
   * @returns Processed text
   */
  public processTranscript(rawText: string, profileId: string | null): string {
    if (!rawText || !rawText.trim()) {
      return rawText;
    }

    let processed = rawText.trim();

    // Stage 0: Basic text processing (fillers, shortcuts, commands)
    processed = this.stage0_BasicProcessing(processed);

    // Stage 1: Phrase replacements (longest first, highest priority)
    const stage1Result = this.stage1_PhraseReplacements(processed);
    processed = stage1Result.text;

    // Stage 2: Word replacements (priority-based)
    const stage2Result = this.stage2_WordReplacements(processed);
    processed = stage2Result.text;

    // Stage 3: Casing and spelling preferences
    processed = this.stage3_CasingSpelling(processed);

    // Stage 4: Punctuation normalization (optional)
    if (this.config.options.normalizePunctuation) {
      processed = this.stage4_PunctuationNormalization(processed);
    }

    // Stage 5: Learning store corrections (if available)
    if (this.config.learningStore && profileId) {
      processed = this.stage5_LearningStoreCorrections(processed);
    }

    return processed.trim();
  }

  // ============================================================================
  // Stage 0: Basic Text Processing
  // ============================================================================

  /**
   * Stage 0: Basic text processing (fillers, shortcuts, commands)
   * This runs before dictionary corrections
   */
  private stage0_BasicProcessing(text: string): string {
    const result = processTranscription(
      text,
      this.config.options.enableShortcuts ? this.config.shortcuts : [],
      {
        removeFillers: this.config.options.removeFillers ?? true,
        handleCommands: true,
        formatNumbers: false,
        applyShortcuts: this.config.options.enableShortcuts ?? true,
      }
    );

    return result.text;
  }

  // ============================================================================
  // Stage 1: Phrase Replacements
  // ============================================================================

  /**
   * Stage 1: Apply phrase replacements
   * Order: Longest phrases first, then by priority
   */
  private stage1_PhraseReplacements(text: string): StageResult {
    const phraseRules = this.buildReplacementRules("phrase");
    
    // Sort: longest first, then by priority (descending)
    const sortedRules = phraseRules.sort((a, b) => {
      if (b.original.length !== a.original.length) {
        return b.original.length - a.original.length; // Longer first
      }
      return b.priority - a.priority; // Higher priority first
    });

    return this.applyReplacements(text, sortedRules, "Stage 1: Phrase Replacements");
  }

  // ============================================================================
  // Stage 2: Word Replacements
  // ============================================================================

  /**
   * Stage 2: Apply word replacements
   * Order: Priority (descending), then by length (longer first)
   */
  private stage2_WordReplacements(text: string): StageResult {
    const wordRules = this.buildReplacementRules("word");
    
    // Sort: priority first, then length
    const sortedRules = wordRules.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return b.original.length - a.original.length; // Longer first
    });

    return this.applyReplacements(text, sortedRules, "Stage 2: Word Replacements");
  }

  // ============================================================================
  // Stage 3: Casing and Spelling Preferences
  // ============================================================================

  /**
   * Stage 3: Apply casing and spelling preferences
   * These are applied after phrase/word replacements to handle
   * capitalization and spelling corrections
   */
  private stage3_CasingSpelling(text: string): string {
    const casingRules = this.buildReplacementRules("casing");
    const spellingRules = this.buildReplacementRules("spelling");
    
    // Combine and sort by priority
    const allRules = [...casingRules, ...spellingRules].sort(
      (a, b) => b.priority - a.priority
    );

    let result = text;
    const applied = new Set<string>();

    for (const rule of allRules) {
      // Check for loops: if replacement contains original, skip
      if (this.wouldCreateLoop(rule.original, rule.replacement, result)) {
        continue;
      }

      // Apply casing rules with case-sensitive matching
      if (rule.type === "casing") {
        const regex = new RegExp(
          this.escapeRegex(rule.original),
          "g" // Case-sensitive, global
        );
        if (regex.test(result)) {
          result = result.replace(regex, rule.replacement);
          applied.add(rule.id);
        }
      } else {
        // Apply spelling rules with word boundaries
        const escaped = this.escapeRegex(rule.original);
        const regex = new RegExp(`\\b${escaped}\\b`, "gi");
        if (regex.test(result)) {
          result = result.replace(regex, (match) => {
            // Preserve original casing
            if (match[0] === match[0].toUpperCase()) {
              return rule.replacement.charAt(0).toUpperCase() + rule.replacement.slice(1);
            }
            return rule.replacement;
          });
          applied.add(rule.id);
        }
      }
    }

    return result;
  }

  // ============================================================================
  // Stage 4: Punctuation Normalization
  // ============================================================================

  /**
   * Stage 4: Normalize punctuation (optional)
   * Cleans up excessive punctuation, spacing, etc.
   */
  private stage4_PunctuationNormalization(text: string): string {
    let result = text;

    // Remove excessive punctuation (e.g., "..." -> ".")
    result = result.replace(/([.!?])\1{2,}/g, "$1");

    // Normalize spacing around punctuation
    result = result.replace(/\s+([,.!?;:])/g, "$1");
    result = result.replace(/([,.!?;:])\s{2,}/g, "$1 ");

    // Ensure space after sentence-ending punctuation
    result = result.replace(/([.!?])([A-Za-z])/g, "$1 $2");

    // Normalize multiple spaces
    result = result.replace(/\s{2,}/g, " ");

    return result;
  }

  // ============================================================================
  // Stage 5: Learning Store Corrections
  // ============================================================================

  /**
   * Stage 5: Apply learning store corrections
   * This runs last to apply learned patterns
   */
  private stage5_LearningStoreCorrections(text: string): string {
    if (!this.config.learningStore) {
      return text;
    }

    return this.config.learningStore.applyLearnedCorrections(text);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Build replacement rules from dictionary entries
   */
  private buildReplacementRules(type: "phrase" | "word" | "spelling" | "casing"): ReplacementRule[] {
    const typeMap: Record<string, PersonalDictionaryEntryEntryType> = {
      phrase: PersonalDictionaryEntryEntryType.phrase,
      word: PersonalDictionaryEntryEntryType.word,
      spelling: PersonalDictionaryEntryEntryType.spelling,
      casing: PersonalDictionaryEntryEntryType.casing,
    };

    return this.config.dictionaryEntries
      .filter(
        (entry) =>
          entry.is_enabled &&
          entry.is_always_replace &&
          entry.entry_type === typeMap[type]
      )
      .map((entry) => ({
        original: entry.original_text,
        replacement: entry.replacement_text,
        type: type as "phrase" | "word" | "spelling" | "casing",
        priority: entry.priority || 0,
        id: entry.id,
      }));
  }

  /**
   * Apply replacements with loop detection
   */
  private applyReplacements(
    text: string,
    rules: ReplacementRule[],
    stageName: string
  ): StageResult {
    let result = text;
    const applied = new Set<string>();
    let iterations = 0;
    let changed = true;

    // Apply rules iteratively until no more changes (with max iterations)
    while (changed && iterations < this.maxIterations) {
      changed = false;
      iterations++;

      for (const rule of rules) {
        // Skip if already applied in this pass
        if (applied.has(rule.id)) {
          continue;
        }

        // Check for loops: if replacement contains original, skip
        if (this.wouldCreateLoop(rule.original, rule.replacement, result)) {
          continue;
        }

        // Build regex based on type
        const regex = this.buildRegexForRule(rule);

        if (regex.test(result)) {
          const beforeReplace = result;
          result = result.replace(regex, (match) => {
            // Preserve original casing
            if (match[0] === match[0].toUpperCase() && rule.replacement.length > 0) {
              return (
                rule.replacement.charAt(0).toUpperCase() + rule.replacement.slice(1)
              );
            }
            return rule.replacement;
          });

          // Check if replacement actually changed the text
          if (result !== beforeReplace) {
            changed = true;
            applied.add(rule.id);
          }
        }
      }

      // Reset applied set for next iteration if we made changes
      if (changed) {
        applied.clear();
      }
    }

    if (iterations >= this.maxIterations) {
      console.warn(
        `${stageName} reached max iterations (${this.maxIterations}). Possible loop detected.`
      );
    }

    return {
      text: result,
      appliedRules: Array.from(applied),
      iterations,
    };
  }

  /**
   * Build regex for a replacement rule
   */
  private buildRegexForRule(rule: ReplacementRule): RegExp {
    const escaped = this.escapeRegex(rule.original);

    // Phrases: match as-is (no word boundaries)
    if (rule.type === "phrase") {
      return new RegExp(escaped, "gi");
    }

    // Words: use word boundaries
    return new RegExp(`\\b${escaped}\\b`, "gi");
  }

  /**
   * Check if a replacement would create a loop
   * A loop occurs if the replacement text contains the original text
   */
  private wouldCreateLoop(original: string, replacement: string, currentText: string): boolean {
    // Simple loop detection: if replacement contains original (case-insensitive)
    const originalLower = original.toLowerCase();
    const replacementLower = replacement.toLowerCase();

    // Direct loop: replacement contains original
    if (replacementLower.includes(originalLower) && originalLower !== replacementLower) {
      return true;
    }

    // Check if replacement would match the same pattern again
    // Example: "there" -> "their" is fine, but "a" -> "an a" would loop
    const originalRegex = new RegExp(this.escapeRegex(original), "gi");
    if (originalRegex.test(replacement)) {
      return true;
    }

    return false;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get pipeline statistics (for debugging/testing)
   */
  public getStatistics(): {
    phraseRules: number;
    wordRules: number;
    spellingRules: number;
    casingRules: number;
  } {
    return {
      phraseRules: this.buildReplacementRules("phrase").length,
      wordRules: this.buildReplacementRules("word").length,
      spellingRules: this.buildReplacementRules("spelling").length,
      casingRules: this.buildReplacementRules("casing").length,
    };
  }
}

/**
 * Create a pipeline instance
 */
export function createPipeline(config: PipelineConfig): PostProcessingPipeline {
  return new PostProcessingPipeline(config);
}

/**
 * Process transcript through pipeline (convenience function)
 */
export function processTranscript(
  rawText: string,
  profileId: string | null,
  config: PipelineConfig
): string {
  const pipeline = createPipeline(config);
  return pipeline.processTranscript(rawText, profileId);
}


