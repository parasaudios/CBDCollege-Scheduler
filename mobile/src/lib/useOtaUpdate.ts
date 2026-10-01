// Over-the-air update state for the UI. Checks on launch + each foreground; when an
// update exists it downloads in the background and flips `ready` so a modal can
// prompt the user. `apply()` restarts straight into the new version.
// No-op in dev / Expo Go (Updates.isEnabled is false there).
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export function useOtaUpdate() {
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!Updates.isEnabled || busy.current || ready) return;
    busy.current = true;
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync(); // download in the background
        setReady(true);
      }
    } catch {
      // Offline or update server unreachable — try again next foreground.
    } finally {
      busy.current = false;
    }
  }, [ready]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      await Updates.reloadAsync(); // restarts into the downloaded update
    } catch {
      setApplying(false);
    }
  }, []);

  return { ready, applying, apply };
}
