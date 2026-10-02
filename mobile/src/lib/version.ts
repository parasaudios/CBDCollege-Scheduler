// Single source of truth for "what version is this app?" — read at RUNTIME from
// the actual build and the running OTA update, so it can never drift from app.json
// (and survives EAS auto-incrementing the build number server-side).
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Version NAME (semver) baked into this build, e.g. "1.3.0". Read at runtime rather
// than hardcoded, so there's nothing to keep in sync by hand.
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

// Date the running JS was published — the OTA update's creation time (or the
// embedded build's). null in dev / Expo Go, where updates are disabled.
export function appUpdatedLabel(): string | null {
  try {
    const d = Updates.createdAt;
    if (!d) return null;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

// One-line label for display, e.g. "v1.3.0 · updated 2 Oct 2026" (or just "v1.3.0").
export function appVersionLabel(): string {
  const when = appUpdatedLabel();
  return `v${APP_VERSION}${when ? ` · updated ${when}` : ''}`;
}

// True if semver string `a` is strictly newer than `b` (e.g. "1.4.0" > "1.3.2").
// Tolerant of missing/extra segments and non-numeric junk.
export function isNewerVersion(a: string, b: string): boolean {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}
