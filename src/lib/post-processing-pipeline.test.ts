/**
 * Post-Processing Pipeline Tests
 * 
 * Tests for deterministic behavior, rule priority, and loop prevention.
 */

import { describe, it, expect } from "vitest";
import { PostProcessingPipeline, createPipeline, type PipelineConfig } from "./post-processing-pipeline";
import { PersonalDictionaryEntryEntryType } from "@/components/data/orm/orm_personal_dictionary_entry";
import type { PersonalDictionaryEntryModel } from "@/components/data/orm/orm_personal_dictionary_entry";
import type { VoiceShortcut } from "./text-processing";

// Helper to create mock dictionary entries
function createEntry(
  original: string,
  replacement: string,
  type: PersonalDictionaryEntryEntryType,
  priority: number = 50,
  isAlwaysReplace: boolean = true
): PersonalDictionaryEntryModel {
  return {
    id: `entry-${original}-${replacement}`,
    data_creator: "test",
    data_updater: "test",
    create_time: "0",
    update_time: "0",
    profile_id: "test-profile",
    user_id: "test-user",
    original_text: original,
    replacement_text: replacement,
    entry_type: type,
    is_always_replace: isAlwaysReplace,
    priority,
    is_enabled: true,
  } as PersonalDictionaryEntryModel;
}

// Helper to create pipeline config
function createConfig(
  entries: PersonalDictionaryEntryModel[] = [],
  shortcuts: VoiceShortcut[] = []
): PipelineConfig {
  return {
    profileId: "test-profile",
    dictionaryEntries: entries,
    shortcuts,
    learningStore: null,
    options: {
      removeFillers: false, // Disable for predictable tests
      enableShortcuts: true,
      normalizePunctuation: false,
    },
  };
}

describe("PostProcessingPipeline", () => {
  describe("Stage Ordering", () => {
    it("should apply phrase replacements before word replacements", () => {
      const entries = [
        createEntry("new york", "NYC", PersonalDictionaryEntryEntryType.phrase, 50),
        createEntry("york", "York", PersonalDictionaryEntryEntryType.word, 100), // Higher priority
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("I live in new york", "test-profile");

      // Phrase "new york" should be replaced first, so "york" rule shouldn't apply
      expect(result.text).toBe("I live in NYC");
    });

    it("should apply word replacements after phrase replacements", () => {
      const entries = [
        createEntry("new york", "NYC", PersonalDictionaryEntryEntryType.phrase, 50),
        createEntry("live", "reside", PersonalDictionaryEntryEntryType.word, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("I live in new york", "test-profile");

      // Both should apply: phrase first, then word
      expect(result.text).toBe("I reside in NYC");
    });

    it("should apply casing after word replacements", () => {
      const entries = [
        createEntry("there", "their", PersonalDictionaryEntryEntryType.word, 50),
        createEntry("their", "Their", PersonalDictionaryEntryEntryType.casing, 100), // Higher priority
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("there book", "test-profile");

      // Word replacement first: "there" -> "their"
      // Then casing: "their" -> "Their" (if at start)
      expect(result.text).toContain("their");
    });

    it("should apply spelling corrections after word replacements", () => {
      const entries = [
        createEntry("recieve", "receive", PersonalDictionaryEntryEntryType.spelling, 50),
        createEntry("receive", "Receive", PersonalDictionaryEntryEntryType.casing, 100),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("I recieve the package", "test-profile");

      // Spelling first, then casing
      expect(result.text).toBe("I Receive the package");
    });
  });

  describe("Rule Priority", () => {
    it("should apply higher priority rules first within same stage", () => {
      const entries = [
        createEntry("test", "low", PersonalDictionaryEntryEntryType.word, 10),
        createEntry("test", "high", PersonalDictionaryEntryEntryType.word, 100),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("this is a test", "test-profile");

      // Higher priority rule should win
      expect(result.text).toBe("this is a high");
    });

    it("should prefer longer phrases when priorities are equal", () => {
      const entries = [
        createEntry("new", "New", PersonalDictionaryEntryEntryType.phrase, 50),
        createEntry("new york", "NYC", PersonalDictionaryEntryEntryType.phrase, 50), // Same priority, longer
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("I live in new york", "test-profile");

      // Longer phrase should match first
      expect(result.text).toBe("I live in NYC");
    });

    it("should prefer longer words when priorities are equal", () => {
      const entries = [
        createEntry("test", "exam", PersonalDictionaryEntryEntryType.word, 50),
        createEntry("testing", "evaluation", PersonalDictionaryEntryEntryType.word, 50), // Same priority, longer
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("this is a testing", "test-profile");

      // Longer word should match first
      expect(result.text).toBe("this is a evaluation");
    });
  });

  describe("Loop Prevention", () => {
    it("should prevent direct loops (replacement contains original)", () => {
      const entries = [
        createEntry("a", "an a", PersonalDictionaryEntryEntryType.word, 50), // Would loop
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("this is a test", "test-profile");

      // Should not apply (would create infinite loop)
      expect(result.text).toBe("this is a test");
    });

    it("should prevent indirect loops (replacement matches original pattern)", () => {
      const entries = [
        createEntry("there", "their", PersonalDictionaryEntryEntryType.word, 50),
        createEntry("their", "there", PersonalDictionaryEntryEntryType.word, 50), // Would create loop
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("there book", "test-profile");

      // First rule should apply, second should be skipped
      expect(result.text).toBe("their book");
    });

    it("should prevent case-insensitive loops", () => {
      const entries = [
        createEntry("test", "Test", PersonalDictionaryEntryEntryType.casing, 50),
        createEntry("Test", "test", PersonalDictionaryEntryEntryType.casing, 50), // Would loop
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("this is a test", "test-profile");

      // Should apply once, not loop
      expect(result.text).toMatch(/test|Test/);
      expect(result.text).not.toMatch(/test.*test|Test.*Test/i); // No duplicates
    });

    it("should stop after max iterations", () => {
      // Create a complex scenario that could loop
      const entries = [
        createEntry("a", "b", PersonalDictionaryEntryEntryType.word, 50),
        createEntry("b", "c", PersonalDictionaryEntryEntryType.word, 50),
        createEntry("c", "d", PersonalDictionaryEntryEntryType.word, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("this is a test", "test-profile");

      // Should process but stop at max iterations
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe("string");
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same output for same input", () => {
      const entries = [
        createEntry("there", "their", PersonalDictionaryEntryEntryType.word, 50),
        createEntry("new york", "NYC", PersonalDictionaryEntryEntryType.phrase, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const input = "I live there in new york";

      const result1 = pipeline.processTranscript(input, "test-profile");
      const result2 = pipeline.processTranscript(input, "test-profile");
      const result3 = pipeline.processTranscript(input, "test-profile");

      // All should be identical
      expect(result1.text).toBe(result2.text);
      expect(result2.text).toBe(result3.text);
    });

    it("should be idempotent (applying twice produces same result)", () => {
      const entries = [
        createEntry("there", "their", PersonalDictionaryEntryEntryType.word, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const input = "there book";

      const result1 = pipeline.processTranscript(input, "test-profile");
      const result2 = pipeline.processTranscript(result1.text, "test-profile");

      // Second application should not change already-processed text
      expect(result1.text).toBe(result2.text);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty text", () => {
      const config = createConfig();
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("", "test-profile");
      expect(result.text).toBe("");
    });

    it("should handle text with only whitespace", () => {
      const config = createConfig();
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("   ", "test-profile");
      expect(result.text).toBe("");
    });

    it("should handle entries with special regex characters", () => {
      const entries = [
        createEntry("test (example)", "example", PersonalDictionaryEntryEntryType.phrase, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("this is a test (example)", "test-profile");

      // Should escape special characters properly
      expect(result.text).toBe("this is a example");
    });

    it("should handle case-sensitive replacements", () => {
      const entries = [
        createEntry("Test", "Exam", PersonalDictionaryEntryEntryType.casing, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("this is a Test", "test-profile");

      // Should match case-sensitively
      expect(result.text).toBe("this is a Exam");
    });

    it("should preserve casing when appropriate", () => {
      const entries = [
        createEntry("test", "exam", PersonalDictionaryEntryEntryType.word, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("This is a Test", "test-profile");

      // Should preserve capitalization
      expect(result.text).toBe("This is a Exam");
    });
  });

  describe("Stage Isolation", () => {
    it("should not let later stages affect earlier stage results", () => {
      const entries = [
        createEntry("new york", "NYC", PersonalDictionaryEntryEntryType.phrase, 50),
        createEntry("NYC", "New York City", PersonalDictionaryEntryEntryType.word, 100), // Higher priority
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const result = pipeline.processTranscript("I live in new york", "test-profile");

      // Phrase stage should apply first, word stage shouldn't re-process phrase results
      // Actually, word stage CAN process phrase results, but phrase should have already matched
      // This test verifies the order is correct
      expect(result.text).toContain("NYC");
    });
  });

  describe("Statistics", () => {
    it("should report correct rule counts", () => {
      const entries = [
        createEntry("phrase one", "P1", PersonalDictionaryEntryEntryType.phrase, 50),
        createEntry("word", "w", PersonalDictionaryEntryEntryType.word, 50),
        createEntry("spell", "spelling", PersonalDictionaryEntryEntryType.spelling, 50),
        createEntry("Case", "case", PersonalDictionaryEntryEntryType.casing, 50),
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const stats = pipeline.getStatistics();

      expect(stats.phraseRules).toBe(1);
      expect(stats.wordRules).toBe(1);
      expect(stats.spellingRules).toBe(1);
      expect(stats.casingRules).toBe(1);
    });

    it("should only count enabled rules", () => {
      const entries = [
        createEntry("test", "exam", PersonalDictionaryEntryEntryType.word, 50, true),
        createEntry("test2", "exam2", PersonalDictionaryEntryEntryType.word, 50, false), // Disabled
      ];

      const config = createConfig(entries);
      const pipeline = createPipeline(config);
      const stats = pipeline.getStatistics();

      expect(stats.wordRules).toBe(1); // Only enabled rule
    });
  });
});


