import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import UpdateBanner from '../components/UpdateBanner';
import { prettyDateLong, prettyTime, timeAgo, todayStr } from '../lib/format';
import { buildExplicitRoster, roleLabel } from '../lib/roster';
import { supabase } from '../lib/supabase';
import type {
  AvailabilityRow,
  DayClass,
  NotificationRow,
  Profile,
  RosterEntry,
  StaffMember,
} from '../lib/types';
import { paletteFor, radius, spacing, type Palette } from '../theme';

interface Props {
  session: Session;
  profile: Profile | null;
}

export default function HomeScreen({ session, profile }: Props) {
  const palette = paletteFor(useColorScheme());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [dayClass, setDayClass] = useState<DayClass | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const today = todayStr();
  const userId = session.user.id;
  const isTrainer = profile?.role === 'trainer';

  const load = useCallback(async () => {
    setError(null);
    try {
      const [staffRes, availRes, classRes] = await Promise.all([
        supabase.from('cbd_staff_members').select('*').order('name'),
        supabase.from('cbd_availability').select('*').eq('date', today),
        supabase
          .from('cbd_day_classes')
          .select('*')
          .eq('date', today)
          .maybeSingle(),
      ]);

      const staff = (staffRes.data || []) as StaffMember[];
      const avail = (availRes.data || []) as AvailabilityRow[];
      setRoster(buildExplicitRoster(avail, staff));

      setDayClass((classRes.data as DayClass) || null);

      // Notifications: trainers see everything; assistants see only their own.
      let nq = supabase
        .from('cbd_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!isTrainer) nq = nq.eq('target_user_id', userId);
      const notifRes = await nq;
      setNotifications((notifRes.data || []) as NotificationRow[]);
    } catch (e: any) {
      setError(e?.message || 'Could not load data.');
    }
  }, [today, userId, isTrainer]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function onSignOut() {
    Alert.alert('Sign out', 'Sign out of the scheduler?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  function openNotification(n: NotificationRow) {
    Alert.alert(n.title, n.message || '(no details)');
  }

  const displayName =
    profile?.full_name || session.user.email || 'there';
  const roleBadge =
    profile?.role === 'trainer' ? 'Trainer' : profile ? 'Assistant' : '';

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
            CBD College Scheduler
          </Text>
          <Text style={[styles.headerSub, { color: palette.textMuted }]}>
            {prettyDateLong(today)}
          </Text>
        </View>
        <Pressable
          onPress={onSignOut}
          style={[styles.signOut, { borderColor: palette.border }]}
        >
          <Text style={{ color: palette.textSecondary, fontWeight: '600' }}>
            Sign out
          </Text>
        </Pressable>
      </View>

      <UpdateBanner />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing(4), paddingBottom: spacing(10) }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
            />
          }
        >
          {error ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: palette.dangerLight,
                  borderColor: palette.danger,
                },
              ]}
            >
              <Text style={{ color: palette.danger }}>{error}</Text>
            </View>
          ) : null}

          {/* Greeting */}
          <Card palette={palette}>
            <Text style={[styles.greeting, { color: palette.textPrimary }]}>
              Hi {firstName(displayName)}
            </Text>
            {roleBadge ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: palette.primaryLight },
                ]}
              >
                <Text style={[styles.badgeText, { color: palette.primaryDark }]}>
                  {roleBadge}
                </Text>
              </View>
            ) : null}
          </Card>

          {/* Today's classes */}
          <SectionTitle palette={palette}>Today's classes</SectionTitle>
          <Card palette={palette}>
            {dayClass ? (
              <View style={styles.classRow}>
                <ClassStat
                  palette={palette}
                  label="AM"
                  value={dayClass.students_am ?? 0}
                />
                <View
                  style={[styles.divider, { backgroundColor: palette.border }]}
                />
                <ClassStat
                  palette={palette}
                  label="PM"
                  value={dayClass.students_pm ?? 0}
                />
              </View>
            ) : (
              <Text style={{ color: palette.textMuted }}>
                No class record for today.
              </Text>
            )}
          </Card>

          {/* Today's roster */}
          <SectionTitle palette={palette}>Rostered today</SectionTitle>
          <Card palette={palette}>
            {roster.length === 0 ? (
              <Text style={{ color: palette.textMuted }}>
                No one is rostered for today.
              </Text>
            ) : (
              roster.map((r, i) => (
                <View
                  key={r.staff_id}
                  style={[
                    styles.rosterRow,
                    i > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: r.color || palette.primary },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.rosterName, { color: palette.textPrimary }]}
                    >
                      {r.name}
                    </Text>
                    <Text
                      style={[styles.rosterMeta, { color: palette.textMuted }]}
                    >
                      {roleLabel(r)}
                      {r.start_time
                        ? ` · ${prettyTime(r.start_time)}${
                            r.end_time ? '–' + prettyTime(r.end_time) : ''
                          }`
                        : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>

          {/* Notifications */}
          <SectionTitle palette={palette}>Recent notifications</SectionTitle>
          <Card palette={palette}>
            {notifications.length === 0 ? (
              <Text style={{ color: palette.textMuted }}>
                No notifications yet.
              </Text>
            ) : (
              notifications.map((n, i) => (
                <Pressable
                  key={n.id}
                  onPress={() => openNotification(n)}
                  style={[
                    styles.notifRow,
                    i > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.notifTitle, { color: palette.textPrimary }]}
                  >
                    {n.title}
                  </Text>
                  {n.message ? (
                    <Text
                      numberOfLines={2}
                      style={[styles.notifMsg, { color: palette.textSecondary }]}
                    >
                      {n.message}
                    </Text>
                  ) : null}
                  <Text style={[styles.notifTime, { color: palette.textMuted }]}>
                    {timeAgo(n.created_at)}
                  </Text>
                </Pressable>
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

function firstName(name: string): string {
  return name.split(' ')[0].split('@')[0];
}

function Card({
  children,
  palette,
}: {
  children: ReactNode;
  palette: Palette;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      {children}
    </View>
  );
}

function SectionTitle({
  children,
  palette,
}: {
  children: ReactNode;
  palette: Palette;
}) {
  return (
    <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
      {children}
    </Text>
  );
}

function ClassStat({
  label,
  value,
  palette,
}: {
  label: string;
  value: number;
  palette: Palette;
}) {
  return (
    <View style={styles.classStat}>
      <Text style={[styles.classValue, { color: palette.textPrimary }]}>
        {value}
      </Text>
      <Text style={[styles.classLabel, { color: palette.textMuted }]}>
        {label} students
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing(12),
    paddingBottom: spacing(4),
    paddingHorizontal: spacing(4),
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  signOut: {
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: radius,
    borderWidth: 1,
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  errorBox: {
    borderRadius: radius,
    borderWidth: 1,
    padding: spacing(3),
    marginBottom: spacing(4),
  },
  greeting: { fontSize: 20, fontWeight: '700' },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    marginTop: spacing(2),
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing(2),
    marginLeft: spacing(1),
  },
  classRow: { flexDirection: 'row', alignItems: 'center' },
  classStat: { flex: 1, alignItems: 'center' },
  classValue: { fontSize: 32, fontWeight: '800' },
  classLabel: { fontSize: 13, marginTop: 2 },
  divider: { width: 1, alignSelf: 'stretch', marginVertical: spacing(1) },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing(3) },
  rosterName: { fontSize: 16, fontWeight: '600' },
  rosterMeta: { fontSize: 13, marginTop: 1 },
  notifRow: { paddingVertical: spacing(3) },
  notifTitle: { fontSize: 15, fontWeight: '700' },
  notifMsg: { fontSize: 14, marginTop: 2 },
  notifTime: { fontSize: 12, marginTop: 4 },
});
