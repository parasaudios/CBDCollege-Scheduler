import { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  APP_VERSION_CODE,
  RELEASE_BASE_URL,
  VERSION_MANIFEST_URL,
} from '../lib/config';
import { paletteFor, radius, spacing } from '../theme';

interface Manifest {
  versionCode: number;
  versionName: string;
  notes?: string;
}

// Self-update check, kerblock-style: fetch the published version.json and, if it
// advertises a higher versionCode than this build, offer a one-tap jump to the
// download page. (Silent background download/install can come later; opening the
// download page works on every device without extra install permissions.)
export default function UpdateBanner() {
  const palette = paletteFor(useColorScheme());
  const [available, setAvailable] = useState<Manifest | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(VERSION_MANIFEST_URL, {
          cache: 'no-store' as RequestCache,
        });
        if (!res.ok) return;
        const m = (await res.json()) as Manifest;
        if (
          !cancelled &&
          m &&
          typeof m.versionCode === 'number' &&
          m.versionCode > APP_VERSION_CODE
        ) {
          setAvailable(m);
        }
      } catch {
        // Offline or release host unreachable — no banner, no noise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available || dismissed) return null;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: palette.primary },
      ]}
    >
      <View style={styles.textCol}>
        <Text style={styles.title}>
          Update available — v{available.versionName}
        </Text>
        {available.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            {available.notes}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => Linking.openURL(RELEASE_BASE_URL)}
        style={styles.updateBtn}
      >
        <Text style={[styles.updateBtnText, { color: palette.primary }]}>
          Update
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={10}
        style={styles.close}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
    gap: spacing(3),
  },
  textCol: { flex: 1 },
  title: { color: '#fff', fontWeight: '700', fontSize: 14 },
  notes: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  updateBtn: {
    backgroundColor: '#fff',
    borderRadius: radius,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  updateBtnText: { fontWeight: '800', fontSize: 13 },
  close: { paddingHorizontal: spacing(1) },
  closeText: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '700' },
});
