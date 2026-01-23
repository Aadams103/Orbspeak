/**
 * SpeakOrb Runtime Interface
 * 
 * Unified runtime interface that exposes all SpeakOrb capabilities
 * through a single, stable API. Prevents features from directly
 * depending on internal modules.
 * 
 * Architecture: Facade pattern - provides simplified interface to
 * complex subsystem of dictation, profiles, learning, and text processing.
 */

import { useSpeechRecognition, type SpeechRecognitionState } from "@/hooks/use-speech-recognition";
import { ProfileLearningStore, getLearningStore } from "@/lib/profile-learning-store";
import { processTranscription, type VoiceShortcut } from "@/lib/text-processing";
import { rewriteText, type HelpMeWriteStyle } from "@/lib/help-me-write";
import {
  PostProcessingPipeline,
  createPipeline,
  type PipelineConfig,
} from "@/lib/post-processing-pipeline";
import type { VoiceProfileModel } from "@/components/data/orm/orm_voice_profile";
import type { PersonalDictionaryEntryModel } from "@/components/data/orm/orm_personal_dictionary_entry";

/**
 * Dictation state event subscriber
 */
export type DictationStateSubscriber = (state: SpeechRecognitionState) => void;

/**
 * Dictation lifecycle events
 */
export type DictationLifecycleEvent = 
  | { type: "started"; timestamp: number }
  | { type: "stopped"; timestamp: number }
  | { type: "error"; error: string; timestamp: number };

export type DictationLifecycleSubscriber = (event: DictationLifecycleEvent) => void;

/**
 * Post-processing options
 */
export interface PostProcessingOptions {
  removeFillers?: boolean;
  enableShortcuts?: boolean;
  applyDictionary?: boolean;
  applyLearning?: boolean;
}

/**
 * Profile information
 */
export interface ProfileInfo {
  id: string;
  name: string;
  isActive: boolean;
  dictionaryEntryCount?: number;
}

/**
 * SpeakOrb Runtime Interface
 * 
 * Single entry point for all SpeakOrb functionality.
 * Features should depend on this interface, not internal modules.
 */
export class SpeakOrbRuntime {
  private static instance: SpeakOrbRuntime | null = null;
  
  // Dictation state
  private speechRecognition: ReturnType<typeof useSpeechRecognition> | null = null;
  private dictationStateSubscribers: Set<DictationStateSubscriber> = new Set();
  private lifecycleSubscribers: Set<DictationLifecycleSubscriber> = new Set();
  private lastDictationState: SpeechRecognitionState | null = null;
  private stateCheckInterval: number | null = null;
  
  // Profile management
  private currentProfileId: string | null = null;
  private currentUserId: string | null = null;
  private profiles: VoiceProfileModel[] = [];
  private profileSubscribers: Set<(profile: ProfileInfo | null) => void> = new Set();
  
  // Learning store
  private learningStore: ProfileLearningStore | null = null;
  
  // Post-processing configuration
  private shortcuts: VoiceShortcut[] = [];
  private dictionaryEntries: PersonalDictionaryEntryModel[] = [];
  private postProcessingOptions: PostProcessingOptions = {
    removeFillers: true,
    enableShortcuts: true,
    applyDictionary: true,
    applyLearning: true,
  };
  private pipeline: PostProcessingPipeline | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SpeakOrbRuntime {
    if (!SpeakOrbRuntime.instance) {
      SpeakOrbRuntime.instance = new SpeakOrbRuntime();
    }
    return SpeakOrbRuntime.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize runtime with speech recognition hook
   */
  public initialize(speechRecognition: ReturnType<typeof useSpeechRecognition>): void {
    this.speechRecognition = speechRecognition;
    
    // Subscribe to state changes
    this.setupDictationStateSubscription();
    
    // Initialize pipeline
    this.rebuildPipeline();
  }

  /**
   * Set current user ID
   */
  public setUserId(userId: string): void {
    this.currentUserId = userId;
  }

  /**
   * Setup dictation state subscription
   */
  private setupDictationStateSubscription(): void {
    if (!this.speechRecognition) return;
    
    // Clear existing interval if any
    if (this.stateCheckInterval !== null) {
      clearInterval(this.stateCheckInterval);
    }

    // Track state changes and notify subscribers
    const checkState = () => {
      if (!this.speechRecognition) return;
      
      const currentState = this.speechRecognition.state;
      
      // Only notify if state actually changed
      if (JSON.stringify(currentState) !== JSON.stringify(this.lastDictationState)) {
        this.lastDictationState = { ...currentState };
        this.notifyDictationStateSubscribers(currentState);
      }
    };

    // Poll for state changes (could be improved with proper event system)
    this.stateCheckInterval = window.setInterval(checkState, 100);
  }

  // ============================================================================
  // Dictation State Events (Subscribe/Publish)
  // ============================================================================

  /**
   * Subscribe to dictation state changes
   */
  public subscribeToDictationState(subscriber: DictationStateSubscriber): () => void {
    this.dictationStateSubscribers.add(subscriber);
    
    // Immediately send current state if available
    if (this.lastDictationState) {
      subscriber(this.lastDictationState);
    } else if (this.speechRecognition) {
      subscriber(this.speechRecognition.state);
    }
    
    // Return unsubscribe function
    return () => {
      this.dictationStateSubscribers.delete(subscriber);
    };
  }

  /**
   * Subscribe to dictation lifecycle events (started, stopped, error)
   */
  public subscribeToDictationLifecycle(subscriber: DictationLifecycleSubscriber): () => void {
    this.lifecycleSubscribers.add(subscriber);
    
    return () => {
      this.lifecycleSubscribers.delete(subscriber);
    };
  }

  /**
   * Notify all dictation state subscribers
   */
  private notifyDictationStateSubscribers(state: SpeechRecognitionState): void {
    this.dictationStateSubscribers.forEach((subscriber) => {
      try {
        subscriber(state);
      } catch (error) {
        console.error("Error in dictation state subscriber:", error);
      }
    });
  }

  /**
   * Publish lifecycle event
   */
  private publishLifecycleEvent(event: DictationLifecycleEvent): void {
    this.lifecycleSubscribers.forEach((subscriber) => {
      try {
        subscriber(event);
      } catch (error) {
        console.error("Error in lifecycle subscriber:", error);
      }
    });
  }

  /**
   * Get current dictation state
   */
  public getDictationState(): SpeechRecognitionState | null {
    return this.speechRecognition?.state || null;
  }

  /**
   * Start dictation
   */
  public startDictation(language?: string): void {
    if (!this.speechRecognition) {
      throw new Error("Runtime not initialized. Call initialize() first.");
    }
    
    this.speechRecognition.startListening(language);
    this.publishLifecycleEvent({ type: "started", timestamp: Date.now() });
  }

  /**
   * Stop dictation
   */
  public stopDictation(): void {
    if (!this.speechRecognition) {
      throw new Error("Runtime not initialized. Call initialize() first.");
    }
    
    this.speechRecognition.stopListening();
    this.publishLifecycleEvent({ type: "stopped", timestamp: Date.now() });
  }

  /**
   * Reset transcript
   */
  public resetTranscript(): void {
    if (!this.speechRecognition) {
      throw new Error("Runtime not initialized. Call initialize() first.");
    }
    
    this.speechRecognition.resetTranscript();
  }

  /**
   * Get current transcript
   */
  public getTranscript(): { final: string; interim: string } {
    if (!this.speechRecognition) {
      return { final: "", interim: "" };
    }
    
    return {
      final: this.speechRecognition.state.transcript,
      interim: this.speechRecognition.state.interimTranscript,
    };
  }

  // ============================================================================
  // Profile Management
  // ============================================================================

  /**
   * Set current profile
   */
  public async setCurrentProfile(profileId: string): Promise<void> {
    if (!this.currentUserId) {
      throw new Error("User ID not set. Call setUserId() first.");
    }
    
    this.currentProfileId = profileId;
    
    // Initialize learning store for new profile
    this.learningStore = getLearningStore(profileId, this.currentUserId);
    if (this.learningStore) {
      await this.learningStore.initialize();
    }
    
    // Rebuild pipeline with new profile
    this.rebuildPipeline();
    
    // Notify subscribers
    const profile = this.getCurrentProfile();
    this.notifyProfileSubscribers(profile);
  }

  /**
   * Get current profile
   */
  public getCurrentProfile(): ProfileInfo | null {
    if (!this.currentProfileId) return null;
    
    const profile = this.profiles.find((p) => p.id === this.currentProfileId);
    if (!profile) return null;
    
    return {
      id: profile.id,
      name: profile.name,
      isActive: profile.is_active,
      dictionaryEntryCount: this.dictionaryEntries.filter(
        (e) => e.profile_id === profile.id
      ).length,
    };
  }

  /**
   * List all profiles
   */
  public listProfiles(): ProfileInfo[] {
    return this.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      isActive: profile.is_active,
      dictionaryEntryCount: this.dictionaryEntries.filter(
        (e) => e.profile_id === profile.id
      ).length,
    }));
  }

  /**
   * Update profiles list (called by external profile management)
   */
  public updateProfiles(profiles: VoiceProfileModel[]): void {
    this.profiles = profiles;
    
    // Update current profile if it changed
    const currentProfile = this.getCurrentProfile();
    this.notifyProfileSubscribers(currentProfile);
  }

  /**
   * Subscribe to profile changes
   */
  public subscribeToProfile(subscriber: (profile: ProfileInfo | null) => void): () => void {
    this.profileSubscribers.add(subscriber);
    
    // Immediately send current profile
    subscriber(this.getCurrentProfile());
    
    return () => {
      this.profileSubscribers.delete(subscriber);
    };
  }

  /**
   * Notify profile subscribers
   */
  private notifyProfileSubscribers(profile: ProfileInfo | null): void {
    this.profileSubscribers.forEach((subscriber) => {
      try {
        subscriber(profile);
      } catch (error) {
        console.error("Error in profile subscriber:", error);
      }
    });
  }

  /**
   * Get current profile ID
   */
  public getCurrentProfileId(): string | null {
    return this.currentProfileId;
  }

  // ============================================================================
  // Post-Processing Pipeline
  // ============================================================================

  /**
   * Configure post-processing options
   */
  public configurePostProcessing(options: Partial<PostProcessingOptions>): void {
    this.postProcessingOptions = {
      ...this.postProcessingOptions,
      ...options,
    };
    this.rebuildPipeline();
  }

  /**
   * Update shortcuts for post-processing
   */
  public updateShortcuts(shortcuts: VoiceShortcut[]): void {
    this.shortcuts = shortcuts;
    this.rebuildPipeline();
  }

  /**
   * Update dictionary entries for post-processing
   */
  public updateDictionaryEntries(entries: PersonalDictionaryEntryModel[]): void {
    this.dictionaryEntries = entries;
    this.rebuildPipeline();
  }

  /**
   * Rebuild pipeline with current configuration
   */
  private rebuildPipeline(): void {
    const config: PipelineConfig = {
      profileId: this.currentProfileId,
      dictionaryEntries: this.dictionaryEntries,
      shortcuts: this.shortcuts,
      learningStore: this.learningStore,
      options: {
        removeFillers: this.postProcessingOptions.removeFillers ?? true,
        enableShortcuts: this.postProcessingOptions.enableShortcuts ?? true,
        normalizePunctuation: false, // Can be made configurable
      },
    };

    this.pipeline = createPipeline(config);
  }

  /**
   * Apply post-processing pipeline to text
   * Uses the formal pipeline with explicit stages
   */
  public processText(text: string): string {
    if (!text || !text.trim()) {
      return text;
    }

    // Ensure pipeline is built
    if (!this.pipeline) {
      this.rebuildPipeline();
    }

    if (!this.pipeline) {
      // Fallback if pipeline can't be built
      return text;
    }

    // Use formal pipeline
    return this.pipeline.processTranscript(text, this.currentProfileId);
  }

  /**
   * Record a correction for learning
   */
  public async recordCorrection(
    original: string,
    corrected: string,
    context?: string,
    alwaysReplace: boolean = false
  ): Promise<void> {
    if (this.learningStore) {
      await this.learningStore.recordCorrection(
        original,
        corrected,
        context,
        alwaysReplace
      );
    }
  }

  // ============================================================================
  // Help Me Write Service
  // ============================================================================

  /**
   * Rewrite text using Help Me Write
   */
  public rewriteText(text: string, style: HelpMeWriteStyle): string {
    return rewriteText(text, style);
  }

  /**
   * Get available Help Me Write styles
   */
  public getHelpMeWriteStyles(): Array<{ value: HelpMeWriteStyle; label: string; description: string }> {
    return [
      { value: "formal", label: "Formal", description: "Professional, polished" },
      { value: "casual", label: "Casual", description: "Friendly, conversational" },
      { value: "creative", label: "Creative", description: "Unique, expressive" },
      { value: "creative_writing", label: "Literary", description: "Narrative flair" },
    ];
  }
}

/**
 * Get runtime instance (convenience function)
 */
export function getRuntime(): SpeakOrbRuntime {
  return SpeakOrbRuntime.getInstance();
}

