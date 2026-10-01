// Over-the-air updates (EAS Update / expo-updates). On launch, expo-updates checks
// and downloads automatically (fallbackToCacheTimeout: 0). This adds a check when
// the app returns to the foreground so a long-running session still picks up a new
// release; the downloaded update applies on the next natural launch (no disruptive
// mid-use reload). Guarded so it's a no-op in Expo Go / dev.
import * as Updates from 'expo-updates';
import { AppState } from 'react-native';

async function checkOnce(): Promise<void> {
  if (!Updates.isEnabled) return;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (res.isAvailable) {
      await Updates.fetchUpdateAsync(); // staged; applied on next launch
    }
  } catch {
    // Offline or update server unreachable — ignore.
  }
}

export function startOtaUpdates(): () => void {
  checkOnce();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') checkOnce();
  });
  return () => sub.remove();
}
