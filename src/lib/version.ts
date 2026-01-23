/**
 * Version Information
 * 
 * Centralized version management for the application.
 * Build version is injected at build time via Vite.
 */

// Build version - injected at build time or from package.json
export const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION || 
  import.meta.env.VITE_APP_VERSION || 
  'dev';

// App version - semantic version
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

// Schema version - matches profile-storage.ts
export const SCHEMA_VERSION = 1;

/**
 * Get full version string
 */
export function getVersionString(): string {
  return `${APP_VERSION} (build ${BUILD_VERSION})`;
}

/**
 * Get version info object
 */
export function getVersionInfo() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'version.ts:29',message:'getVersionInfo called',data:{appVersion:APP_VERSION,buildVersion:BUILD_VERSION,schemaVersion:SCHEMA_VERSION},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  return {
    appVersion: APP_VERSION,
    buildVersion: BUILD_VERSION,
    schemaVersion: SCHEMA_VERSION,
  };
}

