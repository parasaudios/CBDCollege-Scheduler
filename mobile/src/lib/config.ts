// Central config for the CBD College Scheduler mobile app.
//
// Supabase keys: the URL and the *publishable* (anon) key are safe to ship in a
// client — Row Level Security on the database is what protects data, not key
// secrecy. These are the same values the web app (index.html) embeds.
export const SUPABASE_URL = 'https://nqbonrcmbhjutlrpjfpk.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_tcEDbGTXXRKm0WJnMC6hGw_2YcqJpUc';

// App identity — keep these in sync with app.json (expo.version / expo.android.versionCode).
// The self-update check compares APP_VERSION_CODE against the versionCode in the
// published version.json, so it MUST match the versionCode of the shipped APK.
export const APP_VERSION = '1.0.0';
export const APP_VERSION_CODE = 1;

// Where releases are hosted (kerblock-style self-hosted APK + version.json).
// Change this to wherever you deploy the mobile/site/ folder. The download page,
// the APK and version.json all live under this base URL.
export const RELEASE_BASE_URL = 'https://cbdcollege-scheduler.pages.dev/';
export const VERSION_MANIFEST_URL = RELEASE_BASE_URL + 'version.json';
