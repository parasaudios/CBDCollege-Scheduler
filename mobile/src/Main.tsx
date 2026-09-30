import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import CalendarScreen from './screens/CalendarScreen';
import HomeScreen from './screens/HomeScreen';
import { paletteFor, spacing } from './theme';

type Tab = 'today' | 'calendar';

interface Props {
  session: Session;
}

export default function Main({ session }: Props) {
  const palette = paletteFor(useColorScheme());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('cbd_profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled) {
        setProfile((data as Profile) || null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.user.id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <View style={{ flex: 1 }}>
        {tab === 'today' ? (
          <HomeScreen session={session} profile={profile} />
        ) : (
          <CalendarScreen session={session} profile={profile} />
        )}
      </View>

      <View
        style={[
          styles.tabBar,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <TabButton
          label="Today"
          icon="🏠"
          active={tab === 'today'}
          activeColor={palette.primary}
          inactiveColor={palette.textMuted}
          onPress={() => setTab('today')}
        />
        <TabButton
          label="Calendar"
          icon="🗓️"
          active={tab === 'calendar'}
          activeColor={palette.primary}
          inactiveColor={palette.textMuted}
          onPress={() => setTab('calendar')}
        />
      </View>
    </View>
  );
}

function TabButton({
  label,
  icon,
  active,
  activeColor,
  inactiveColor,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
}) {
  const color = active ? activeColor : inactiveColor;
  return (
    <Pressable onPress={onPress} style={styles.tabBtn}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing(2),
    paddingBottom: spacing(6),
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
});
