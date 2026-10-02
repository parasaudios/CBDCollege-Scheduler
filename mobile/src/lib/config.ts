// Central config for the CBD College Scheduler mobile app.
//
// Supabase keys: the URL and the *publishable* (anon) key are safe to ship in a
// client — Row Level Security on the database is what protects data, not key
// secrecy. These are the same values the web app (index.html) embeds.
export const SUPABASE_URL = 'https://nqbonrcmbhjutlrpjfpk.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_tcEDbGTXXRKm0WJnMC6hGw_2YcqJpUc';

// App version is read at runtime from the build — see lib/version.ts (APP_VERSION).
// Nothing to keep in sync here, and the EAS-managed build number can't drift.

// Where releases are hosted (kerblock-style self-hosted APK + version.json).
// Change this to wherever you deploy the mobile/site/ folder. The download page,
// the APK and version.json all live under this base URL.
export const RELEASE_BASE_URL = 'https://cbdcollege-scheduler.pages.dev/';
export const VERSION_MANIFEST_URL = RELEASE_BASE_URL + 'version.json';
