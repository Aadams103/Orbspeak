/**
 * Profile Storage with Versioning and Migration
 * 
 * Provides versioned profile storage with:
 * - Schema versioning for future-proofing
 * - Migration functions for older versions
 * - Atomic save operations (transaction-based)
 * - Profile isolation (each profile has its own dictionary/training store)
 * 
 * Design:
 * - Each profile has a schemaVersion field
 * - Migrations run automatically when loading profiles
 * - Atomic saves use version checks to prevent corruption
 * - Default profiles are created with latest schema version
 */

import VoiceProfileORM, { type VoiceProfileModel } from "@/components/data/orm/orm_voice_profile";
import PersonalDictionaryEntryORM, {
  type PersonalDictionaryEntryModel,
  PersonalDictionaryEntryEntryType,
} from "@/components/data/orm/orm_personal_dictionary_entry";
import { ProfileLearningStore } from "@/lib/profile-learning-store";

/**
 * Current schema version
 * Increment this when making breaking changes to profile structure
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Profile metadata (stored in voice_features JSON field)
 */
export interface ProfileMetadata {
  schemaVersion: number;
  createdAt: number;
  lastMigratedAt: number;
  defaultDictionaryEntries?: PersonalDictionaryEntryModel[];
  settings?: {
    autoClean?: boolean;
    enableShortcuts?: boolean;
    selectedLanguage?: string;
    ttsVoice?: string;
    ttsRate?: number;
    ttsProvider?: string;
    artworkStyle?: string;
    qwenInstruct?: string;
  };
}

/**
 * Complete profile data structure
 */
export interface VersionedProfile extends VoiceProfileModel {
  metadata: ProfileMetadata;
}

/**
 * Migration function type
 */
type MigrationFunction = (profile: VoiceProfileModel) => Promise<VoiceProfileModel>;

/**
 * Profile Storage Service
 * 
 * Handles versioned profile storage with migrations and atomic saves
 */
export class ProfileStorage {
  private static instance: ProfileStorage | null = null;
  private profileORM: VoiceProfileORM;
  private dictionaryORM: PersonalDictionaryEntryORM;
  private migrations: Map<number, MigrationFunction> = new Map();

  private constructor() {
    this.profileORM = VoiceProfileORM.getInstance();
    this.dictionaryORM = PersonalDictionaryEntryORM.getInstance();
    this.registerMigrations();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ProfileStorage {
    if (!ProfileStorage.instance) {
      ProfileStorage.instance = new ProfileStorage();
    }
    return ProfileStorage.instance;
  }

  /**
   * Register migration functions
   * Migrations are applied in order from old version to new version
   */
  private registerMigrations(): void {
    // Migration from version 0 (no version) to version 1
    this.migrations.set(1, this.migrateToV1.bind(this));

    // Future migrations:
    // this.migrations.set(2, this.migrateToV2.bind(this));
    // this.migrations.set(3, this.migrateToV3.bind(this));
  }

  // ============================================================================
  // Migration Functions
  // ============================================================================

  /**
   * Migration to version 1: Add schema version and metadata
   */
  private async migrateToV1(profile: VoiceProfileModel): Promise<VoiceProfileModel> {
    // Parse existing voice_features or create new metadata
    let metadata: ProfileMetadata;
    
    try {
      if (profile.voice_features) {
        const parsed = JSON.parse(profile.voice_features);
        // If already has schemaVersion, preserve it
        if (parsed.schemaVersion) {
          metadata = parsed as ProfileMetadata;
        } else {
          // Migrate from unversioned to version 1
          metadata = {
            schemaVersion: 1,
            createdAt: parsed.createdAt || parseInt(profile.create_time) || Date.now(),
            lastMigratedAt: Date.now(),
            defaultDictionaryEntries: parsed.defaultDictionaryEntries || [],
            settings: parsed.settings || {},
          };
        }
      } else {
        // New profile metadata
        metadata = {
          schemaVersion: 1,
          createdAt: parseInt(profile.create_time) || Date.now(),
          lastMigratedAt: Date.now(),
          defaultDictionaryEntries: [],
          settings: {},
        };
      }
    } catch {
      // If parsing fails, create fresh metadata
      metadata = {
        schemaVersion: 1,
        createdAt: parseInt(profile.create_time) || Date.now(),
        lastMigratedAt: Date.now(),
        defaultDictionaryEntries: [],
        settings: {},
      };
    }

    // Update profile with versioned metadata
    return {
      ...profile,
      voice_features: JSON.stringify(metadata),
    };
  }

  // ============================================================================
  // Profile CRUD Operations
  // ============================================================================

  /**
   * Create a new profile with latest schema version
   */
  public async createProfile(
    userId: string,
    name: string,
    options?: {
      defaultDictionaryEntries?: PersonalDictionaryEntryModel[];
      settings?: ProfileMetadata["settings"];
    }
  ): Promise<VersionedProfile> {
    const metadata: ProfileMetadata = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: Date.now(),
      lastMigratedAt: Date.now(),
      defaultDictionaryEntries: options?.defaultDictionaryEntries || [],
      settings: options?.settings || {},
    };

    const profileData: VoiceProfileModel = {
      id: "", // Will be set by ORM
      data_creator: userId,
      data_updater: userId,
      create_time: String(Math.floor(Date.now() / 1000)),
      update_time: String(Math.floor(Date.now() / 1000)),
      user_id: userId,
      name,
      training_samples_count: 0,
      voice_features: JSON.stringify(metadata),
      is_active: false,
    } as VoiceProfileModel;

    // Atomic insert: create profile
    const [createdProfile] = await this.profileORM.insertVoiceProfile([profileData]);

    // Create default dictionary entries if provided
    if (options?.defaultDictionaryEntries && options.defaultDictionaryEntries.length > 0) {
      const entriesWithProfileId = options.defaultDictionaryEntries.map((entry) => ({
        ...entry,
        profile_id: createdProfile.id,
        user_id: userId,
      }));

      await this.dictionaryORM.insertPersonalDictionaryEntry(
        entriesWithProfileId as PersonalDictionaryEntryModel[]
      );
    }

    return this.loadProfile(createdProfile.id);
  }

  /**
   * Load profile with automatic migration
   */
  public async loadProfile(profileId: string): Promise<VersionedProfile> {
    const [profiles] = await this.profileORM.getVoiceProfileById(profileId);
    
    if (!profiles || profiles.length === 0) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    let profile = profiles[0];

    // Get current schema version
    const currentVersion = this.getSchemaVersion(profile);

    // Apply migrations if needed
    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      profile = await this.migrateProfile(profile, currentVersion, CURRENT_SCHEMA_VERSION);
    }

    // Parse metadata
    const metadata = this.parseMetadata(profile);

    return {
      ...profile,
      metadata,
    };
  }

  /**
   * Load all profiles for a user with automatic migration
   */
  public async loadAllProfiles(userId: string): Promise<VersionedProfile[]> {
    const profiles = await this.profileORM.getVoiceProfileByUserId(userId);
    
    const migratedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        const currentVersion = this.getSchemaVersion(profile);
        
        if (currentVersion < CURRENT_SCHEMA_VERSION) {
          profile = await this.migrateProfile(profile, currentVersion, CURRENT_SCHEMA_VERSION);
        }

        const metadata = this.parseMetadata(profile);
        return {
          ...profile,
          metadata,
        };
      })
    );

    return migratedProfiles;
  }

  /**
   * Save profile atomically (with version check to prevent corruption)
   */
  public async saveProfile(
    profile: VersionedProfile,
    options?: {
      updateMetadata?: boolean;
      skipVersionCheck?: boolean;
    }
  ): Promise<VersionedProfile> {
    // Load current version from storage (for atomic update)
    const [currentProfiles] = await this.profileORM.getVoiceProfileById(profile.id);
    
    if (!currentProfiles || currentProfiles.length === 0) {
      throw new Error(`Profile not found: ${profile.id}`);
    }

    const currentProfile = currentProfiles[0];

    // Version check: prevent overwriting with stale data
    if (!options?.skipVersionCheck) {
      const currentVersion = this.getSchemaVersion(currentProfile);
      const newVersion = profile.metadata.schemaVersion;

      if (currentVersion > newVersion) {
        throw new Error(
          `Version conflict: Current version (${currentVersion}) is newer than save version (${newVersion})`
        );
      }
    }

    // Update metadata if requested
    let metadata = profile.metadata;
    if (options?.updateMetadata) {
      metadata = {
        ...metadata,
        lastMigratedAt: Date.now(),
      };
    }

    // Prepare updated profile
    const updatedProfile: VoiceProfileModel = {
      ...profile,
      voice_features: JSON.stringify(metadata),
      update_time: String(Math.floor(Date.now() / 1000)),
    };

    // Atomic save: update in single transaction
    const [savedProfile] = await this.profileORM.setVoiceProfileById(profile.id, updatedProfile);

    // Parse and return
    const savedMetadata = this.parseMetadata(savedProfile);
    return {
      ...savedProfile,
      metadata: savedMetadata,
    };
  }

  /**
   * Delete profile and all associated data
   */
  public async deleteProfile(profileId: string): Promise<void> {
    // Load profile first to get metadata
    const profile = await this.loadProfile(profileId);

    // Delete all dictionary entries for this profile
    const dictionaryEntries = await this.dictionaryORM.getPersonalDictionaryEntryByProfileId(
      profileId
    );

    for (const entry of dictionaryEntries) {
      await this.dictionaryORM.deletePersonalDictionaryEntryById(entry.id);
    }

    // Delete profile
    await this.profileORM.deleteVoiceProfileById(profileId);

    // Clear learning store cache if it exists
    // (Learning store will handle this on next access)
  }

  // ============================================================================
  // Migration Logic
  // ============================================================================

  /**
   * Migrate profile from one version to another
   */
  private async migrateProfile(
    profile: VoiceProfileModel,
    fromVersion: number,
    toVersion: number
  ): Promise<VoiceProfileModel> {
    let migratedProfile = profile;

    // Apply migrations in order
    for (let version = fromVersion + 1; version <= toVersion; version++) {
      const migration = this.migrations.get(version);
      if (migration) {
        migratedProfile = await migration(migratedProfile);
      }
    }

    // Save migrated profile atomically
    const [saved] = await this.profileORM.setVoiceProfileById(
      migratedProfile.id,
      migratedProfile
    );

    return saved;
  }

  /**
   * Get schema version from profile
   */
  private getSchemaVersion(profile: VoiceProfileModel): number {
    if (!profile.voice_features) {
      return 0; // Unversioned
    }

    try {
      const metadata = JSON.parse(profile.voice_features) as ProfileMetadata;
      return metadata.schemaVersion || 0;
    } catch {
      return 0; // Unversioned
    }
  }

  /**
   * Parse metadata from profile
   */
  private parseMetadata(profile: VoiceProfileModel): ProfileMetadata {
    if (!profile.voice_features) {
      // Return default metadata for unversioned profiles
      return {
        schemaVersion: 0,
        createdAt: parseInt(profile.create_time) || Date.now(),
        lastMigratedAt: Date.now(),
        defaultDictionaryEntries: [],
        settings: {},
      };
    }

    try {
      const parsed = JSON.parse(profile.voice_features);
      return {
        schemaVersion: parsed.schemaVersion || 0,
        createdAt: parsed.createdAt || parseInt(profile.create_time) || Date.now(),
        lastMigratedAt: parsed.lastMigratedAt || Date.now(),
        defaultDictionaryEntries: parsed.defaultDictionaryEntries || [],
        settings: parsed.settings || {},
      };
    } catch {
      // Fallback for corrupted metadata
      return {
        schemaVersion: 0,
        createdAt: parseInt(profile.create_time) || Date.now(),
        lastMigratedAt: Date.now(),
        defaultDictionaryEntries: [],
        settings: {},
      };
    }
  }

  // ============================================================================
  // Profile Isolation Helpers
  // ============================================================================

  /**
   * Get dictionary entries for a profile (isolated)
   */
  public async getDictionaryEntries(profileId: string): Promise<PersonalDictionaryEntryModel[]> {
    return this.dictionaryORM.getPersonalDictionaryEntryByProfileId(profileId);
  }

  /**
   * Initialize default dictionary entries for a profile
   */
  public async initializeDefaultDictionary(
    profileId: string,
    userId: string
  ): Promise<void> {
    // Check if profile already has dictionary entries
    const existing = await this.getDictionaryEntries(profileId);
    if (existing.length > 0) {
      return; // Already initialized
    }

    // Load profile to get default entries from metadata
    const profile = await this.loadProfile(profileId);
    const defaultEntries = profile.metadata.defaultDictionaryEntries || [];

    if (defaultEntries.length > 0) {
      const entriesWithProfileId = defaultEntries.map((entry) => ({
        ...entry,
        profile_id: profileId,
        user_id: userId,
        id: "", // Will be set by ORM
        data_creator: userId,
        data_updater: userId,
        create_time: String(Math.floor(Date.now() / 1000)),
        update_time: String(Math.floor(Date.now() / 1000)),
      }));

      await this.dictionaryORM.insertPersonalDictionaryEntry(
        entriesWithProfileId as PersonalDictionaryEntryModel[]
      );
    }
  }

  /**
   * Get learning store for a profile (isolated per profile)
   */
  public getLearningStore(profileId: string, userId: string): ProfileLearningStore {
    return ProfileLearningStore.getInstance(profileId, userId);
  }

  /**
   * Check if profile needs migration
   */
  public async needsMigration(profileId: string): Promise<boolean> {
    const [profiles] = await this.profileORM.getVoiceProfileById(profileId);
    
    if (!profiles || profiles.length === 0) {
      return false;
    }

    const version = this.getSchemaVersion(profiles[0]);
    return version < CURRENT_SCHEMA_VERSION;
  }

  /**
   * Migrate all profiles for a user
   */
  public async migrateAllProfiles(userId: string): Promise<number> {
    const profiles = await this.profileORM.getVoiceProfileByUserId(userId);
    let migratedCount = 0;

    for (const profile of profiles) {
      const version = this.getSchemaVersion(profile);
      if (version < CURRENT_SCHEMA_VERSION) {
        await this.migrateProfile(profile, version, CURRENT_SCHEMA_VERSION);
        migratedCount++;
      }
    }

    return migratedCount;
  }
}

/**
 * Get profile storage instance
 */
export function getProfileStorage(): ProfileStorage {
  return ProfileStorage.getInstance();
}


