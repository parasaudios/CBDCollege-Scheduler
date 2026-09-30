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
import { Btn, Card, EmptyNote, Pills } from '../components/ui';
import { loadRosterContext } from '../lib/data';
import {
  buildMonthGrid,
  monthLabel,
  prettyDateLong,
  prettyTime,
  todayStr,
  WEEKDAY_HEADERS,
} from '../lib/format';
import { roleLabel } from '../lib/roster';
import { makeRoster, type RosterContext } from '../lib/rosterCompute';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { HERO_GRADIENT, radius, spacing } from '../theme';

type Sub = 'roster' | 'overview';

interface Props {
  session: Session;
  profile: Profile | null;
}

export default function ScheduleScreen({ session, profile }: Props) {
  const { palette } = useTheme();
  const isTrainer = profile?.role === 'trainer';
  const userId = session.user.id;
  const today = todayStr();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [sub, setSub] = useState<Sub>('roster');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<RosterContext | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const grid = useMemo(() => buildMonthGrid(year, month0), [year, month0]);
  const engine = useMemo(() => (ctx ? makeRoster(ctx) : null), [ctx]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { ctx: loaded } = await loadRosterContext(year, month0);
      setCtx(loaded);
    } catch (e: any) {
      setError(e?.message || 'Could not load the month.');
    }
  }, [year, month0]);

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

  function step(delta: number) {
    let m = month0 + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    setMonth0(m);
    setYear(y);
  }

  async function syncStudents() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const { error: e } = await supabase.functions.invoke('sync-vasto-students', {
        body: { days: 30 },
      });
      if (e) throw e;
      setSyncMsg('Synced. Refreshing…');
      await load();
      setSyncMsg('Student numbers updated.');
    } catch (e: any) {
      setSyncMsg('Sync failed: ' + (e?.message || 'unknown error') + ' (is the function deployed?)');
    }
    setSyncing(false);
  }

  function myAvailFor(dateStr: string): boolean | undefined {
    if (!ctx) return undefined;
    const entry = (ctx.assistantAvailByDate[dateStr] || []).find((e) => e.user_id === userId);
    return entry ? entry.is_available : undefined;
  }

  const heroRoster = engine ? engine.getRosterForDate(today) : [];
  const heroInfo = engine ? engine.getEffectiveClassInfo(today) : null;
  const heroHoliday = engine ? engine.isPublicHoliday(today) : false;

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      {loading || !engine ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12) }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
          }
        >
          {/* Today hero */}
          <View style={[styles.hero, { backgroundColor: HERO_GRADIENT[0] }]}>
            <Text style={styles.heroLabel}>TODAY</Text>
            <Text style={styles.heroDate}>{prettyDateLong(today)}</Text>
            <View style={styles.heroRow}>
              <HeroStat label="AM" value={heroHoliday ? '—' : String(heroInfo?.students_am ?? 0)} />
              <HeroStat label="PM" value={heroHoliday ? '—' : String(heroInfo?.students_pm ?? 0)} />
              <HeroStat label="On roster" value={String(heroRoster.length)} />
            </View>
            <View style={styles.heroStaff}>
              {heroHoliday ? (
                <Text style={styles.heroEmpty}>Public holiday — no classes.</Text>
              ) : heroRoster.length === 0 ? (
                <Text style={styles.heroEmpty}>No one rostered today.</Text>
              ) : (
                <View style={styles.heroChips}>
                  {heroRoster.map((r) => (
                    <View
                      key={r.staff_id + r.day_role}
                      style={[
                        styles.heroChip,
                        r.is_head_trainer && { backgroundColor: '#fff' },
                      ]}
                    >
                      <Text
                        style={{
                          color: r.is_head_trainer ? palette.primary : '#fff',
                          fontWeight: r.is_head_trainer ? '700' : '500',
                          fontSize: 13,
                        }}
                      >
                        {r.name.split(' ')[0]}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: palette.dangerLight, borderColor: palette.danger }]}>
              <Text style={{ color: palette.danger }}>{error}</Text>
            </View>
          ) : null}

          <Card>
            <View style={[styles.cardHeader, { borderBottomColor: palette.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Staff Roster</Text>
                <Text style={[styles.cardSub, { color: palette.textMuted }]}>
                  Tap a day to see or edit its roster.
                </Text>
              </View>
              {isTrainer ? (
                <Btn label="Sync students" icon="↻" variant="outline" size="sm" busy={syncing} onPress={syncStudents} />
              ) : null}
            </View>

            <View style={{ padding: spacing(3) }}>
              {syncMsg ? (
                <Text style={{ color: palette.textMuted, fontSize: 12, marginBottom: spacing(2) }}>{syncMsg}</Text>
              ) : null}

              <Pills
                options={[
                  { key: 'roster' as Sub, label: 'Roster' },
                  { key: 'overview' as Sub, label: 'Team overview' },
                ]}
                value={sub}
                onChange={setSub}
              />

              {/* Month nav */}
              <View style={styles.nav}>
                <NavBtn label="‹" onPress={() => step(-1)} />
                <Pressable onPress={() => { const d = new Date(); setYear(d.getFullYear()); setMonth0(d.getMonth()); }}>
                  <Text style={[styles.monthLabel, { color: palette.textPrimary }]}>{monthLabel(year, month0)}</Text>
                </Pressable>
                <NavBtn label="›" onPress={() => step(1)} />
              </View>

              {sub === 'roster' ? (
                <RosterGrid
                  grid={grid}
                  engine={engine}
                  today={today}
                  isTrainer={isTrainer}
                  myAvailFor={myAvailFor}
                  onSelect={setSelected}
                />
              ) : (
                <Overview grid={grid} engine={engine} onSelect={setSelected} />
              )}
            </View>
          </Card>
        </ScrollView>
      )}

      <DayDetailSheet
        visible={selected != null}
        dateStr={selected}
        session={session}
        profile={profile}
        ctx={ctx}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
    </View>
  );
}

function RosterGrid({
  grid,
  engine,
  today,
  isTrainer,
  myAvailFor,
  onSelect,
}: {
  grid: (string | null)[];
  engine: ReturnType<typeof makeRoster>;
  today: string;
  isTrainer: boolean;
  myAvailFor: (d: string) => boolean | undefined;
  onSelect: (d: string) => void;
}) {
  const { palette } = useTheme();
  return (
    <>
      <View style={styles.weekRow}>
        {WEEKDAY_HEADERS.map((w, i) => (
          <View key={i} style={styles.weekHeadCell}>
            <Text style={[styles.weekHeadText, { color: palette.textMuted }]}>{w}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {grid.map((dateStr, i) => {
          if (!dateStr) return <View key={i} style={styles.cell} />;
          const isToday = dateStr === today;
          const holiday = engine.isPublicHoliday(dateStr);
          const info = engine.getEffectiveClassInfo(dateStr);
          const hasClass =
            info.from_default === false || info.students_am > 0 || info.students_pm > 0 || info.capped_am || info.capped_pm;
          const roster = engine.getRosterForDate(dateStr);
          const dots = roster.slice(0, 4);
          const myAvail = !isTrainer ? myAvailFor(dateStr) : undefined;
          return (
            <Pressable
              key={i}
              onPress={() => onSelect(dateStr)}
              style={[
                styles.cell,
                {
                  backgroundColor: holiday
                    ? palette.holiday + '22'
                    : isToday
                      ? palette.primaryLight
                      : palette.surface,
                  borderColor: isToday ? palette.primary : holiday ? palette.holiday : palette.border,
                },
              ]}
            >
              <View style={styles.cellTop}>
                <Text
                  style={[
                    styles.dayNum,
                    { color: isToday ? palette.primaryDark : palette.textPrimary, fontWeight: isToday ? '800' : '600' },
                  ]}
                >
                  {parseInt(dateStr.slice(-2), 10)}
                </Text>
                {myAvail === false ? (
                  <View style={[styles.mine, { backgroundColor: palette.danger }]} />
                ) : myAvail === true ? (
                  <View style={[styles.mine, { backgroundColor: palette.success }]} />
                ) : null}
              </View>
              {holiday ? (
                <Text style={[styles.phTag, { color: palette.holiday }]}>PH</Text>
              ) : hasClass ? (
                <Text style={[styles.clsBadge, { color: palette.textMuted }]}>
                  {info.students_am + '/' + info.students_pm}
                </Text>
              ) : (
                <View style={{ height: 13 }} />
              )}
              <View style={styles.dotRow}>
                {dots.map((r, di) => (
                  <View
                    key={di}
                    style={[
                      styles.miniDot,
                      { backgroundColor: r.color || palette.primary },
                      r.is_head_trainer && { borderWidth: 1.5, borderColor: palette.primary },
                    ]}
                  />
                ))}
                {roster.length > 4 ? (
                  <Text style={[styles.more, { color: palette.textMuted }]}>+{roster.length - 4}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.legend, { color: palette.textMuted }]}>
        Numbers are AM/PM students (PH = public holiday). Dots are rostered staff; ringed = head trainer.
        {!isTrainer ? ' Green/red mark your own availability.' : ''}
      </Text>
    </>
  );
}

// Overview: a readable vertical list of the month's class days with rostered staff names.
function Overview({
  grid,
  engine,
  onSelect,
}: {
  grid: (string | null)[];
  engine: ReturnType<typeof makeRoster>;
  onSelect: (d: string) => void;
}) {
  const { palette } = useTheme();
  const days = grid.filter((d): d is string => !!d && (engine.isClassDay(d) || engine.getRosterForDate(d).length > 0));
  if (days.length === 0) return <EmptyNote>No class days this month.</EmptyNote>;
  return (
    <View style={{ marginTop: spacing(3) }}>
      {days.map((d) => {
        const roster = engine.getRosterForDate(d);
        const info = engine.getEffectiveClassInfo(d);
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            style={[styles.ovRow, { borderBottomColor: palette.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.textPrimary, fontWeight: '600', fontSize: 14 }}>
                {prettyDateLong(d)}
              </Text>
              <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}>
                {info.students_am}/{info.students_pm} students
                {roster.length ? ' · ' + roster.map((r) => r.name.split(' ')[0]).join(', ') : ' · no one rostered'}
              </Text>
            </View>
            <Text style={{ color: palette.textMuted }}>›</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue}>{value}</Text>
    </View>
  );
}

function NavBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.navBtn, { borderColor: palette.border }]}>
      <Text style={{ color: palette.textPrimary, fontSize: 20, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const CELL_PCT = `${100 / 7}%`;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 14, padding: spacing(4), marginBottom: spacing(3) },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroDate: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 },
  heroRow: { flexDirection: 'row', gap: spacing(8), marginTop: spacing(3) },
  heroStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  heroStatValue: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  heroStaff: { marginTop: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  heroChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  heroEmpty: { color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', fontSize: 14 },
  errorBox: { borderRadius: radius, borderWidth: 1, padding: spacing(3), marginBottom: spacing(3) },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing(4), borderBottomWidth: 1, gap: spacing(3) },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(4), marginBottom: spacing(3) },
  navBtn: { width: 40, height: 40, borderRadius: radius, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: spacing(1) },
  weekHeadCell: { width: CELL_PCT as any, alignItems: 'center' },
  weekHeadText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_PCT as any, aspectRatio: 0.8, borderWidth: 1, borderRadius: 8, padding: 3 },
  cellTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayNum: { fontSize: 13 },
  mine: { width: 7, height: 7, borderRadius: 4 },
  clsBadge: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  phTag: { fontSize: 10, fontWeight: '800', marginTop: 1 },
  dotRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto', gap: 2 },
  miniDot: { width: 7, height: 7, borderRadius: 4 },
  more: { fontSize: 9, marginLeft: 1 },
  legend: { fontSize: 12, lineHeight: 17, marginTop: spacing(3) },
  ovRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(3), borderBottomWidth: 1, gap: spacing(3) },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
