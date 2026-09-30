import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DayDetailSheet from '../components/DayDetailSheet';
import { Card } from '../components/ui';
import { loadRosterContext } from '../lib/data';
import { buildMonthGrid, monthLabel, prettyDateLong, prettyTime, todayStr, WEEKDAY_HEADERS } from '../lib/format';
import { makeRoster, type RosterContext } from '../lib/rosterCompute';
import type { Profile } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { HERO_GRADIENT, radius, spacing } from '../theme';

export default function MyRosterScreen({ session, profile }: { session: Session; profile: Profile | null }) {
  const { palette } = useTheme();
  const userId = session.user.id;
  const today = todayStr();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ctx, setCtx] = useState<RosterContext | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(year, month0), [year, month0]);
  const engine = useMemo(() => (ctx ? makeRoster(ctx) : null), [ctx]);
  const myStaffId = ctx?.staff.find((s) => s.user_id === userId)?.id;

  const load = useCallback(async () => {
    const { ctx: loaded } = await loadRosterContext(year, month0);
    setCtx(loaded);
  }, [year, month0]);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  function step(d: number) {
    let m = month0 + d, y = year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setMonth0(m); setYear(y);
  }

  // Next shift: first date from today this month where I'm rostered.
  let nextShift: { date: string; start: string | null } | null = null;
  let workingToday = false;
  if (engine && myStaffId) {
    const todaysRoster = engine.getRosterForDate(today).find((r) => r.staff_id === myStaffId);
    workingToday = !!todaysRoster;
    for (const d of grid) {
      if (!d || d < today) continue;
      const mine = engine.getRosterForDate(d).find((r) => r.staff_id === myStaffId);
      if (mine) { nextShift = { date: d, start: mine.start_time }; break; }
    }
  }

  if (loading || !engine) {
    return <View style={{ flex: 1, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={palette.primary} /></View>;
  }

  const linked = !!myStaffId;

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
      >
        <View style={[styles.hero, { backgroundColor: HERO_GRADIENT[0] }]}>
          <Text style={styles.heroLabel}>TODAY</Text>
          <Text style={styles.heroDate}>{prettyDateLong(today)}</Text>
          <View style={[styles.badge, { backgroundColor: workingToday ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.2)' }]}>
            <Text style={{ color: workingToday ? palette.primary : '#fff', fontWeight: '800', fontSize: 13 }}>
              {workingToday ? "YOU'RE WORKING" : 'NOT NEEDED TODAY'}
            </Text>
          </View>
          {!linked ? (
            <Text style={styles.heroEmpty}>Your account isn't linked to a staff profile yet — ask a trainer.</Text>
          ) : nextShift ? (
            <Text style={styles.heroNext}>
              Next shift: {prettyDateLong(nextShift.date)}{nextShift.start ? ` · from ${prettyTime(nextShift.start)}` : ''}
            </Text>
          ) : (
            <Text style={styles.heroEmpty}>No upcoming shifts this month.</Text>
          )}
        </View>

        <Card>
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
                const holiday = engine.isPublicHoliday(dateStr);
                const classDay = engine.isClassDay(dateStr);
                const mine = myStaffId ? engine.getRosterForDate(dateStr).find((r) => r.staff_id === myStaffId) : undefined;
                const rostered = !!mine;
                const bg = holiday ? palette.holiday + '22' : rostered ? palette.successLight : classDay ? palette.dangerLight : palette.surface;
                const bd = isToday ? palette.primary : rostered ? palette.successBorder : classDay ? palette.dangerBorder : palette.border;
                return (
                  <Pressable key={i} onPress={() => setSelected(dateStr)} style={[styles.cell, { backgroundColor: bg, borderColor: bd, borderWidth: isToday ? 2 : 1 }]}>
                    <Text style={[styles.dayNum, { color: isToday ? palette.primaryDark : palette.textPrimary, fontWeight: isToday ? '800' : '600' }]}>
                      {parseInt(dateStr.slice(-2), 10)}
                    </Text>
                    {holiday ? (
                      <Text style={[styles.mark, { color: palette.holiday }]}>PH</Text>
                    ) : rostered ? (
                      <Text style={[styles.mark, { color: palette.success }]}>✓{mine?.start_time ? ' ' + prettyTime(mine.start_time) : ''}</Text>
                    ) : classDay ? (
                      <Text style={[styles.mark, { color: palette.danger }]}>—</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.legend, { color: palette.textMuted }]}>Green = you're rostered. Red = class runs but you're not needed. PH = public holiday.</Text>
          </View>
        </Card>
      </ScrollView>

      <DayDetailSheet visible={selected != null} dateStr={selected} session={session} profile={profile} ctx={ctx} onClose={() => setSelected(null)} onChanged={load} />
    </View>
  );
}

function NavBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette } = useTheme();
  return <Pressable onPress={onPress} hitSlop={8} style={[styles.navBtn, { borderColor: palette.border }]}><Text style={{ color: palette.textPrimary, fontSize: 20, fontWeight: '700' }}>{label}</Text></Pressable>;
}

const CELL_PCT = `${100 / 7}%`;
const styles = StyleSheet.create({
  hero: { borderRadius: 14, padding: spacing(4), marginBottom: spacing(3) },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroDate: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: spacing(3), paddingVertical: spacing(1), marginTop: spacing(3) },
  heroNext: { color: '#fff', marginTop: spacing(3), fontSize: 14, fontWeight: '600' },
  heroEmpty: { color: 'rgba(255,255,255,0.85)', marginTop: spacing(3), fontSize: 14, fontStyle: 'italic' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  navBtn: { width: 40, height: 40, borderRadius: radius, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: spacing(1) },
  weekHeadCell: { width: CELL_PCT as any, alignItems: 'center' },
  weekHeadText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_PCT as any, aspectRatio: 0.85, borderRadius: 8, padding: 4, alignItems: 'center' },
  dayNum: { fontSize: 13 },
  mark: { fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  legend: { fontSize: 12, lineHeight: 17, marginTop: spacing(3) },
});
