/**
 * Profile Learning Store
 * 
 * A per-profile learning system that tracks corrections and applies learned patterns
 * as a post-processing layer. Operates independently of the dictation engine.
 * 
 * Features:
 * - Tracks user corrections per profile
 * - Learns from correction patterns
 * - Applies learned corrections automatically
 * - Persists all data locally via ORM
 */

import PersonalDictionaryEntryORM, {
  type PersonalDictionaryEntryModel,
  PersonalDictionaryEntryEntryType,
} from "@/components/data/orm/orm_personal_dictionary_entry";

/**
 * Correction record for learning
 */
export interface CorrectionRecord {
  original: string;
  corrected: string;
  context?: string; // Surrounding text for context-aware learning
  timestamp: number;
  confidence?: number; // User confidence or frequency-based
}

/**
 * Learned pattern from corrections
 */
export interface LearnedPattern {
  original: string;
  replacement: string;
  frequency: number; // How many times this correction was made
  lastUsed: number; // Timestamp of last application
  contexts: string[]; // Common contexts where this correction applies
  confidence: number; // Calculated confidence (0-1)
}

/**
 * Learning statistics per profile
 */
export interface LearningStats {
  profileId: string;
  totalCorrections: number;
  uniquePatterns: number;
  lastLearned: number; // Timestamp
  patterns: LearnedPattern[];
}

/**
 * Profile Learning Store
 * 
 * Manages learning and correction application per profile.
 * All operations are synchronous for post-processing pipeline.
 */
export class ProfileLearningStore {
  private static instances: Map<string, ProfileLearningStore> = new Map();
  private dictionaryORM: PersonalDictionaryEntryORM;
  private profileId: string;
  private userId: string;
  
  // In-memory cache for fast lookups
  private learnedPatternsCache: Map<string, LearnedPattern> = new Map();
  private dictionaryEntriesCache: PersonalDictionaryEntryModel[] = [];
  private cacheValid: boolean = false;

  private constructor(profileId: string, userId: string) {
    this.profileId = profileId;
    this.userId = userId;
    this.dictionaryORM = PersonalDictionaryEntryORM.getInstance();
  }

  /**
   * Get or create learning store instance for a profile
   */
  public static getInstance(profileId: string, userId: string): ProfileLearningStore {
    const key = `${userId}:${profileId}`;
    if (!ProfileLearningStore.instances.has(key)) {
      ProfileLearningStore.instances.set(key, new ProfileLearningStore(profileId, userId));
    }
    return ProfileLearningStore.instances.get(key)!;
  }

  /**
   * Initialize and load learning data for the profile
   * Should be called when profile is activated
   */
  public async initialize(): Promise<void> {
    await this.refreshCache();
  }

  /**
   * Refresh the in-memory cache from persistent storage
   */
  private async refreshCache(): Promise<void> {
    try {
      const entries = await this.dictionaryORM.getPersonalDictionaryEntryByProfileId(
        this.profileId
      );
      
      this.dictionaryEntriesCache = entries.filter((e) => e.is_enabled);
      this.learnedPatternsCache.clear();

      // Build learned patterns from dictionary entries
      for (const entry of this.dictionaryEntriesCache) {
        const pattern: LearnedPattern = {
          original: entry.original_text.toLowerCase(),
          replacement: entry.replacement_text,
          frequency: this.calculateFrequency(entry),
          lastUsed: parseInt(entry.update_time) || Date.now(),
          contexts: entry.pronunciation_hint ? [entry.pronunciation_hint] : [],
          confidence: this.calculateConfidence(entry),
        };
        
        this.learnedPatternsCache.set(pattern.original, pattern);
      }

      this.cacheValid = true;
    } catch (error) {
      console.error("Failed to refresh learning cache:", error);
      this.cacheValid = false;
    }
  }

  /**
   * Calculate frequency from entry metadata
   * Uses update_time and training_samples_count as proxies
   */
  private calculateFrequency(entry: PersonalDictionaryEntryModel): number {
    // Base frequency on training_samples_count if available
    // Otherwise, use 1 + number of updates (approximated from timestamps)
    const baseFreq = entry.priority || 1;
    const updateCount = entry.update_time && entry.create_time
      ? Math.max(1, Math.floor((parseInt(entry.update_time) - parseInt(entry.create_time)) / 86400))
      : 1;
    
    return Math.max(1, baseFreq + updateCount);
  }

  /**
   * Calculate confidence score (0-1) for a learned pattern
   */
  private calculateConfidence(entry: PersonalDictionaryEntryModel): number {
    // Higher confidence if:
    // - is_always_replace is true
    // - Higher priority
    // - More recent updates
    let confidence = 0.5; // Base confidence

    if (entry.is_always_replace) {
      confidence += 0.3;
    }

    // Priority-based boost (normalized)
    const priorityBoost = Math.min(0.2, (entry.priority || 0) / 100);
    confidence += priorityBoost;

    // Recency boost (if updated recently)
    if (entry.update_time) {
      const updateTime = parseInt(entry.update_time);
      const daysSinceUpdate = (Date.now() / 1000 - updateTime) / 86400;
      if (daysSinceUpdate < 7) {
        confidence += 0.1;
      }
    }

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Record a correction for learning
   * This is called when user makes a manual correction
   */
  public async recordCorrection(
    original: string,
    corrected: string,
    context?: string,
    alwaysReplace: boolean = false
  ): Promise<void> {
    const originalLower = original.toLowerCase().trim();
    const correctedTrimmed = corrected.trim();

    if (!originalLower || !correctedTrimmed || originalLower === correctedTrimmed) {
      return; // Invalid correction
    }

    try {
      // Check if entry already exists
      const existing = await this.dictionaryORM.getPersonalDictionaryEntryByOriginalTextProfileId(
        originalLower,
        this.profileId
      );

      const isPhrase = originalLower.includes(" ");
      const entryType = isPhrase
        ? PersonalDictionaryEntryEntryType.phrase
        : PersonalDictionaryEntryEntryType.word;

      if (existing.length > 0) {
        // Update existing entry
        const entry = existing[0];
        const updatedEntry: PersonalDictionaryEntryModel = {
          ...entry,
          replacement_text: correctedTrimmed,
          is_always_replace: alwaysReplace || entry.is_always_replace,
          pronunciation_hint: context || entry.pronunciation_hint || null,
          priority: Math.min(100, (entry.priority || 50) + 1), // Increment priority
          is_enabled: true,
        };

        await this.dictionaryORM.setPersonalDictionaryEntryById(entry.id, updatedEntry);
      } else {
        // Create new entry
        const newEntry = await this.dictionaryORM.insertPersonalDictionaryEntry([
          {
            profile_id: this.profileId,
            user_id: this.userId,
            original_text: originalLower,
            replacement_text: correctedTrimmed,
            entry_type: entryType,
            is_always_replace: alwaysReplace,
            pronunciation_hint: context || null,
            priority: isPhrase ? 100 : 50, // Phrases get higher priority
            is_enabled: true,
          } as PersonalDictionaryEntryModel,
        ]);

        if (newEntry.length > 0) {
          this.dictionaryEntriesCache.push(newEntry[0]);
        }
      }

      // Refresh cache to include new/updated pattern
      await this.refreshCache();
    } catch (error) {
      console.error("Failed to record correction:", error);
    }
  }

  /**
   * Apply learned corrections to text (post-processing)
   * This is the main entry point for the post-processing pipeline
   */
  public applyLearnedCorrections(text: string): string {
    if (!this.cacheValid || this.learnedPatternsCache.size === 0) {
      return text; // No patterns learned yet
    }

    let result = text;

    // Sort patterns by priority (higher priority first) and length (longer first)
    // This ensures phrases are matched before individual words
    const sortedPatterns = Array.from(this.learnedPatternsCache.values())
      .filter((p) => p.confidence >= 0.3) // Only apply high-confidence patterns
      .sort((a, b) => {
        // First by confidence (descending)
        if (Math.abs(b.confidence - a.confidence) > 0.1) {
          return b.confidence - a.confidence;
        }
        // Then by length (descending) - longer patterns first
        if (b.original.length !== a.original.length) {
          return b.original.length - a.original.length;
        }
        // Finally by frequency (descending)
        return b.frequency - a.frequency;
      });

    // Apply patterns in order
    for (const pattern of sortedPatterns) {
      // Escape special regex characters
      const escapedOriginal = pattern.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      
      // Use word boundaries for single words, but not for phrases
      const isPhrase = pattern.original.includes(" ");
      const regex = isPhrase
        ? new RegExp(escapedOriginal, "gi")
        : new RegExp(`\\b${escapedOriginal}\\b`, "gi");

      if (regex.test(result)) {
        result = result.replace(regex, (match) => {
          // Preserve original casing if replacement is capitalized
          if (match[0] === match[0].toUpperCase()) {
            return pattern.replacement.charAt(0).toUpperCase() + pattern.replacement.slice(1);
          }
          return pattern.replacement;
        });

        // Update last used timestamp (async, don't await)
        this.updatePatternUsage(pattern.original).catch(console.error);
      }
    }

    return result;
  }

  /**
   * Update pattern usage timestamp (async, fire-and-forget)
   */
  private async updatePatternUsage(original: string): Promise<void> {
    try {
      const pattern = this.learnedPatternsCache.get(original);
      if (!pattern) return;

      // Update in-memory cache
      pattern.lastUsed = Date.now();
      pattern.frequency += 0.1; // Increment frequency slightly

      // Find corresponding dictionary entry and update
      const entry = this.dictionaryEntriesCache.find(
        (e) => e.original_text.toLowerCase() === original
      );
      
      if (entry) {
        const updatedEntry: PersonalDictionaryEntryModel = {
          ...entry,
          priority: Math.min(100, (entry.priority || 50) + 0.1),
        };
        
        await this.dictionaryORM.setPersonalDictionaryEntryById(entry.id, updatedEntry);
        
        // Update cache
        const index = this.dictionaryEntriesCache.findIndex((e) => e.id === entry.id);
        if (index !== -1) {
          this.dictionaryEntriesCache[index] = updatedEntry;
        }
      }
    } catch (error) {
      // Silently fail - this is a background update
      console.debug("Failed to update pattern usage:", error);
    }
  }

  /**
   * Get learning statistics for the profile
   */
  public async getLearningStats(): Promise<LearningStats> {
    await this.refreshCache();

    return {
      profileId: this.profileId,
      totalCorrections: this.dictionaryEntriesCache.length,
      uniquePatterns: this.learnedPatternsCache.size,
      lastLearned: this.dictionaryEntriesCache.length > 0
        ? Math.max(
            ...this.dictionaryEntriesCache.map((e) => parseInt(e.update_time) || 0)
          )
        : 0,
      patterns: Array.from(this.learnedPatternsCache.values()),
    };
  }

  /**
   * Get all learned patterns (for inspection/debugging)
   */
  public getLearnedPatterns(): LearnedPattern[] {
    return Array.from(this.learnedPatternsCache.values());
  }

  /**
   * Clear all learned patterns for this profile
   */
  public async clearLearning(): Promise<void> {
    try {
      const entries = await this.dictionaryORM.getPersonalDictionaryEntryByProfileId(
        this.profileId
      );

      for (const entry of entries) {
        await this.dictionaryORM.deletePersonalDictionaryEntryById(entry.id);
      }

      this.learnedPatternsCache.clear();
      this.dictionaryEntriesCache = [];
      this.cacheValid = true;
    } catch (error) {
      console.error("Failed to clear learning:", error);
      throw error;
    }
  }

  /**
   * Invalidate cache (call when external changes occur)
   */
  public invalidateCache(): void {
    this.cacheValid = false;
  }

  /**
   * Manually refresh cache (useful after external updates)
   */
  public async refresh(): Promise<void> {
    await this.refreshCache();
  }
}

/**
 * Convenience function to get learning store for active profile
 */
export function getLearningStore(profileId: string | null, userId: string): ProfileLearningStore | null {
  if (!profileId) return null;
  return ProfileLearningStore.getInstance(profileId, userId);
}


