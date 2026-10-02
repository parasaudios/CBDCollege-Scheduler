import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Btn, Card, CardHeader } from '../components/ui';
import { rosteredUserIdsForDate } from '../lib/data';
import { buildMonthGrid, monthLabel, monthRange, prettyDateLong, todayStr, WEEKDAY_HEADERS } from '../lib/format';
import { allTrainerUserIds, notifyChange } from '../lib/notify';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_SHORT: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

export default function MyAvailabilityScreen({ session, profile }: { session: Session; profile: Profile | null }) {
  const { palette } = useTheme();
  const userId = session.user.id;
  const actorName = profile?.full_name || session.user.email || 'An assistant';
  const today = todayStr();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [dows, setDows] = useState<number[]>([]);
  const [savingPat, setSavingPat] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const grid = useMemo(() => buildMonthGrid(year, month0), [year, month0]);

  const load = useCallback(async () => {
    const { start, end } = monthRange(year, month0);
    const [pRes, oRes] = await Promise.all([
      supabase.from('cbd_profiles').select('available_dows').eq('id', userId).maybeSingle(),
      supabase.from('cbd_assistant_availability').select('date, is_available').eq('user_id', userId).gte('date', start).lte('date', end),
    ]);
    const ad = (pRes.data as { available_dows: number[] | null } | null)?.available_dows;
    setDows(Array.isArray(ad) ? ad : [0, 1, 2, 3, 4, 5, 6]);
    const map: Record<string, boolean> = {};
    ((oRes.data || []) as { date: string; is_available: boolean }[]).forEach((r) => { map[r.date] = r.is_available; });
    setOverrides(map);
  }, [userId, year, month0]);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  function toggleDow(dow: number) {
    setDows((cur) => (cur.includes(dow) ? cur.filter((d) => d !== dow) : [...cur, dow].sort()));
  }

  async function savePattern() {
    setSavingPat(true);
    const { error } = await supabase.from('cbd_profiles').update({ available_dows: dows }).eq('id', userId);
    setSavingPat(false);
    if (error) { Alert.alert('Error', error.message); return; }
    await notifyChange({
      type: 'availability_changed_by_assistant',
      actorId: userId,
      actorName,
      subjectUserId: userId,
      subjectName: actorName,
      affectedUserIds: await allTrainerUserIds(),
      title: `${actorName}'s weekly availability changed`,
      message: 'Weekly availability pattern changed.',
      data: { action: 'self_pattern' },
    });
    Alert.alert('Saved', 'Your weekly pattern was updated.');
  }

  function step(d: number) {
    let m = month0 + d, y = year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setMonth0(m); setYear(y);
  }

  function tapDay(date: string) {
    if (date < today) { Alert.alert('Past date', "You can't change availability for past days."); return; }
    Alert.alert(prettyDateLong(date), 'Set your availability', [
      { text: 'Available', onPress: () => setDay(date, true) },
      { text: 'Not available', onPress: () => setDay(date, false) },
      { text: 'Clear', style: 'destructive', onPress: () => clearDay(date) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function setDay(date: string, isAvail: boolean) {
    const before = await rosteredUserIdsForDate(date);
    const { error } = await supabase.from('cbd_assistant_availability').upsert(
      { user_id: userId, date, is_available: isAvail, note: '' }, { onConflict: 'user_id,date' },
    );
    if (error) { Alert.alert('Error', error.message); return; }
    const after = await rosteredUserIdsForDate(date);
    await notifyChange({
      type: 'availability_changed_by_assistant',
      actorId: userId,
      actorName,
      subjectUserId: userId,
      subjectName: actorName,
      affectedUserIds: [...before, ...after],
      title: `${actorName}'s availability changed`,
      message: `${prettyDateLong(date)} — ${isAvail ? 'Available' : 'Not available'}`,
      data: { date, is_available: isAvail, action: 'self_set' },
    });
    load();
  }

  async function clearDay(date: string) {
    const before = await rosteredUserIdsForDate(date);
    await supabase.from('cbd_assistant_availability').delete().eq('user_id', userId).eq('date', date);
    const after = await rosteredUserIdsForDate(date);
    await notifyChange({
      type: 'availability_changed_by_assistant',
      actorId: userId,
      actorName,
      subjectUserId: userId,
      subjectName: actorName,
      affectedUserIds: [...before, ...after],
      title: `${actorName}'s availability changed`,
      message: `${prettyDateLong(date)} — availability cleared`,
      data: { date, action: 'self_cleared' },
    });
    load();
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={palette.primary} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.surface2 }} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12), gap: spacing(3) }}>
      <Card>
        <CardHeader title="My Weekly Availability" subtitle="The days you can normally work." />
        <View style={{ padding: spacing(4) }}>
          <View style={styles.dowPills}>
            {DOW_ORDER.map((dow) => {
              const on = dows.includes(dow);
              return (
                <Pressable key={dow} onPress={() => toggleDow(dow)} style={[styles.dowPill, { backgroundColor: on ? palette.success : palette.surface2, borderColor: on ? palette.success : palette.border }]}>
                  <Text style={{ color: on ? '#fff' : palette.textSecondary, fontWeight: '600' }}>{DOW_SHORT[dow]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Btn label="Save Weekly Pattern" busy={savingPat} onPress={savePattern} style={{ marginTop: spacing(3) }} />
        </View>
      </Card>

      <Card>
        <CardHeader title="One-off Date Overrides" subtitle="Tap a day to change just that date." />
        <View style={{ padding: spacing(4) }}>
          <View style={styles.nav}>
            <NavBtn label="‹" onPress={() => step(-1)} />
            <Pressable onPress={() => { const d = new Date(); setYear(d.getFullYear()); setMonth0(d.getMonth()); }}>
              <Text style={[styles.monthLabel, { color: palette.textPrimary }]}>{monthLabel(year, month0)}</Text>
            </Pressable>
            <NavBtn label="›" onPress={() => step(1)} />
          </View>
          <View style={styles.weekRow}>
            {WEEKDAY_HEADERS.map((w, i) => <View key={i} style={styles.weekHeadCell}><Text style={[styles.weekHeadText, { color: palette.textMuted }]}>{w}</Text></View>)}
          </View>
          <View style={styles.grid}>
            {grid.map((dateStr, i) => {
              if (!dateStr) return <View key={i} style={styles.cell} />;
              const isToday = dateStr === today;
              const ov = overrides[dateStr];
              const bg = ov === false ? palette.dangerLight : ov === true ? palette.successLight : palette.surface;
              const bd = isToday ? palette.primary : ov === false ? palette.dangerBorder : ov === true ? palette.successBorder : palette.border;
              return (
                <Pressable key={i} onPress={() => tapDay(dateStr)} style={[styles.cell, { backgroundColor: bg, borderColor: bd, borderWidth: isToday ? 2 : 1 }]}>
                  <Text style={[styles.dayNum, { color: isToday ? palette.primaryDark : palette.textPrimary, fontWeight: isToday ? '800' : '600' }]}>{parseInt(dateStr.slice(-2), 10)}</Text>
                  {ov === false ? <Text style={[styles.mark, { color: palette.danger }]}>Off</Text> : ov === true ? <Text style={[styles.mark, { color: palette.success }]}>On</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.legend, { color: palette.textMuted }]}>
            <Text style={{ color: palette.success, fontWeight: '700' }}>Green</Text> = available ·{' '}
            <Text style={{ color: palette.danger, fontWeight: '700' }}>Red</Text> = not available. Tap any upcoming day to change it.
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

function NavBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette } = useTheme();
  return <Pressable onPress={onPress} hitSlop={8} style={[styles.navBtn, { borderColor: palette.border }]}><Text style={{ color: palette.textPrimary, fontSize: 20, fontWeight: '700' }}>{label}</Text></Pressable>;
}

const CELL_PCT = `${100 / 7}%`;
const styles = StyleSheet.create({
  dowPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  dowPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing(4), paddingVertical: spacing(2) },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  navBtn: { width: 40, height: 40, borderRadius: radius, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: spacing(1) },
  weekHeadCell: { width: CELL_PCT as any, alignItems: 'center' },
  weekHeadText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_PCT as any, aspectRatio: 0.9, borderRadius: 8, padding: 4, alignItems: 'center' },
  dayNum: { fontSize: 13 },
  mark: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  legend: { fontSize: 12, lineHeight: 17, marginTop: spacing(3) },
});
