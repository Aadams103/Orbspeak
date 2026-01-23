# Profile Versioning and Migration

## Overview

SpeakOrb uses versioned profile storage to ensure future-proofing and data integrity. Each profile includes a schema version that allows automatic migration when the profile structure changes.

## Architecture

```
┌─────────────────────────────────────────┐
│      ProfileStorage Service             │
│  (Versioning + Migration + Atomic Save)  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│      VoiceProfileORM                    │
│  (Data Persistence Layer)               │
└─────────────────────────────────────────┘
```

## Schema Versioning

### Current Version

- **CURRENT_SCHEMA_VERSION**: `1`

### Version History

- **Version 0**: Unversioned profiles (legacy)
- **Version 1**: Initial versioned schema with metadata

### Profile Metadata Structure

Metadata is stored in the `voice_features` JSON field:

```typescript
interface ProfileMetadata {
  schemaVersion: number;           // Current schema version
  createdAt: number;                // Profile creation timestamp
  lastMigratedAt: number;          // Last migration timestamp
  defaultDictionaryEntries?: ...;   // Default dictionary entries
  settings?: {                      // Profile-specific settings
    autoClean?: boolean;
    enableShortcuts?: boolean;
    selectedLanguage?: string;
  };
}
```

## Migration System

### Automatic Migration

Profiles are automatically migrated when:
- Loading a profile (`loadProfile`)
- Loading all profiles (`loadAllProfiles`)
- On app startup (via `migrateAllProfiles`)

### Migration Process

1. **Detect Version**: Check current schema version
2. **Apply Migrations**: Run migrations in order from current to target version
3. **Save Atomically**: Update profile with new version
4. **Verify**: Ensure migration succeeded

### Adding a New Migration

```typescript
// In ProfileStorage.registerMigrations()
this.migrations.set(2, this.migrateToV2.bind(this));

// Implement migration function
private async migrateToV2(profile: VoiceProfileModel): Promise<VoiceProfileModel> {
  const metadata = this.parseMetadata(profile);
  
  // Transform data for version 2
  const newMetadata: ProfileMetadata = {
    ...metadata,
    schemaVersion: 2,
    lastMigratedAt: Date.now(),
    // Add new fields or transform existing ones
  };
  
  return {
    ...profile,
    voice_features: JSON.stringify(newMetadata),
  };
}
```

## Atomic Save Operations

### Version Check

Atomic saves prevent data corruption by checking versions:

```typescript
// Load current version
const currentVersion = getSchemaVersion(currentProfile);

// Check before save
if (currentVersion > newVersion) {
  throw new Error("Version conflict: Current version is newer");
}
```

### Transaction Pattern

1. **Load**: Get current profile from storage
2. **Check**: Verify version compatibility
3. **Update**: Modify profile data
4. **Save**: Write atomically (single operation)
5. **Verify**: Confirm save succeeded

## Profile Isolation

Each profile has its own isolated data:

### Dictionary Entries

```typescript
// Get dictionary entries for a profile
const entries = await profileStorage.getDictionaryEntries(profileId);

// All entries are scoped to profile_id
```

### Learning Store

```typescript
// Get learning store for a profile
const learningStore = profileStorage.getLearningStore(profileId, userId);

// Learning patterns are isolated per profile
```

### Default Initialization

When creating a profile:

```typescript
const profile = await profileStorage.createProfile(userId, "My Profile", {
  defaultDictionaryEntries: [...],  // Optional defaults
  settings: {
    autoClean: true,
    enableShortcuts: true,
    selectedLanguage: "en-US",
  },
});

// Initialize defaults
await profileStorage.initializeDefaultDictionary(profile.id, userId);
```

## Usage Examples

### Create Profile

```typescript
const profileStorage = getProfileStorage();

const profile = await profileStorage.createProfile(
  "user-1",
  "Work Profile",
  {
    defaultDictionaryEntries: [
      {
        original_text: "CEO",
        replacement_text: "Chief Executive Officer",
        entry_type: PersonalDictionaryEntryEntryType.phrase,
        priority: 100,
        is_always_replace: true,
      },
    ],
    settings: {
      autoClean: true,
      enableShortcuts: true,
      selectedLanguage: "en-US",
    },
  }
);
```

### Load Profile (with auto-migration)

```typescript
// Automatically migrates if needed
const profile = await profileStorage.loadProfile(profileId);

console.log(profile.metadata.schemaVersion); // Current version
console.log(profile.metadata.lastMigratedAt); // Migration timestamp
```

### Save Profile (atomic)

```typescript
// Update profile
profile.name = "Updated Name";
profile.metadata.settings.autoClean = false;

// Atomic save with version check
const saved = await profileStorage.saveProfile(profile, {
  updateMetadata: true,      // Update lastMigratedAt
  skipVersionCheck: false,   // Enable version conflict detection
});
```

### Delete Profile (with cleanup)

```typescript
// Deletes profile and all associated data
await profileStorage.deleteProfile(profileId);

// Automatically cleans up:
// - Dictionary entries
// - Learning store cache
// - Profile metadata
```

### Migrate All Profiles

```typescript
// On app startup
const migratedCount = await profileStorage.migrateAllProfiles(userId);

if (migratedCount > 0) {
  console.log(`Migrated ${migratedCount} profile(s)`);
}
```

## Best Practices

### 1. Always Use ProfileStorage

**Don't:**
```typescript
// Direct ORM access (bypasses versioning)
await voiceProfileORM.setVoiceProfileById(id, profile);
```

**Do:**
```typescript
// Use ProfileStorage (includes versioning)
await profileStorage.saveProfile(versionedProfile);
```

### 2. Handle Migration Errors

```typescript
try {
  const profile = await profileStorage.loadProfile(id);
} catch (error) {
  if (error.message.includes("migration")) {
    // Handle migration failure
    console.error("Migration failed:", error);
  }
}
```

### 3. Check Migration Status

```typescript
const needsMigration = await profileStorage.needsMigration(profileId);

if (needsMigration) {
  // Trigger migration
  await profileStorage.loadProfile(profileId);
}
```

### 4. Version Compatibility

When adding new fields:
- Use optional fields in metadata
- Provide defaults in migration
- Don't break existing profiles

## Migration Testing

### Test Migration Path

```typescript
// Create old version profile
const oldProfile = createProfileV0();

// Migrate
const migrated = await profileStorage.migrateProfile(
  oldProfile,
  0,  // from version
  1   // to version
);

// Verify
expect(migrated.metadata.schemaVersion).toBe(1);
```

### Test Atomic Save

```typescript
// Simulate concurrent update
const profile1 = await profileStorage.loadProfile(id);
const profile2 = await profileStorage.loadProfile(id);

// Update both
profile1.name = "Name 1";
profile2.name = "Name 2";

// Save both (one should fail)
await profileStorage.saveProfile(profile1);
await expect(
  profileStorage.saveProfile(profile2)
).rejects.toThrow("Version conflict");
```

## Future Considerations

### Schema Evolution

When adding new schema versions:

1. **Increment Version**: Update `CURRENT_SCHEMA_VERSION`
2. **Add Migration**: Register migration function
3. **Test Migration**: Verify old profiles migrate correctly
4. **Update Metadata**: Add new fields to `ProfileMetadata` interface
5. **Document Changes**: Update this file

### Breaking Changes

If a breaking change is needed:

1. **Major Version**: Increment major version number
2. **Migration Required**: Ensure migration handles all cases
3. **Backward Compatibility**: Consider supporting old versions temporarily
4. **Data Loss**: Document any data that cannot be migrated

## Summary

- ✅ **Versioned Storage**: Every profile has a schema version
- ✅ **Automatic Migration**: Profiles migrate automatically when loaded
- ✅ **Atomic Saves**: Version checks prevent data corruption
- ✅ **Profile Isolation**: Each profile has its own dictionary/training store
- ✅ **Default Initialization**: New profiles get defaults automatically
- ✅ **Future-Proof**: Easy to add new schema versions


