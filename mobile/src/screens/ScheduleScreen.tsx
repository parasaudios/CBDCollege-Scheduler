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
import AutoRosterModal from '../components/AutoRosterModal';
import DayDetailSheet from '../components/DayDetailSheet';
import { Btn, Card, EmptyNote, Pills, StatusBadge, type StatusKind } from '../components/ui';
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
import type { Profile, StaffMember } from '../lib/types';
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
  const [selStaffId, setSelStaffId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

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

  // Default the colour-by staff member to the signed-in trainer (or the first
  // staff member), and keep the choice stable as the month data reloads.
  useEffect(() => {
    if (!ctx) return;
    setSelStaffId((prev) => {
      if (prev && ctx.staff.some((s) => s.id === prev)) return prev;
      const mine = ctx.staff.find((s) => s.user_id === userId);
      return mine?.id ?? ctx.staff[0]?.id ?? null;
    });
  }, [ctx, userId]);

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
                <>
                  {isTrainer && ctx ? (
                    <StaffPicker
                      staff={ctx.staff}
                      value={selStaffId}
                      onChange={setSelStaffId}
                    />
                  ) : null}
                  <RosterGrid
                    grid={grid}
                    engine={engine}
                    staff={ctx ? ctx.staff : []}
                    selStaffId={selStaffId}
                    today={today}
                    isTrainer={isTrainer}
                    myAvailFor={myAvailFor}
                    onSelect={setSelected}
                  />
                </>
              ) : (
                <>
                  {isTrainer ? (
                    <View style={{ marginTop: spacing(3) }}>
                      <Btn label="Auto-roster this month" icon="✨" variant="outline" size="sm" onPress={() => setAutoOpen(true)} />
                    </View>
                  ) : null}
                  <Overview grid={grid} engine={engine} onSelect={setSelected} />
                </>
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

      {ctx ? (
        <AutoRosterModal
          visible={autoOpen}
          ctx={ctx}
          year={year}
          month0={month0}
          session={session}
          profile={profile}
          onClose={() => setAutoOpen(false)}
          onApplied={load}
        />
      ) : null}
    </View>
  );
}

// Horizontal chip picker: choose which staff member the calendar colours by.
function StaffPicker({
  staff,
  value,
  onChange,
}: {
  staff: StaffMember[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { palette } = useTheme();
  if (!staff.length) return null;
  return (
    <View style={{ marginTop: spacing(3) }}>
      <Text style={[styles.pickerLabel, { color: palette.textMuted }]}>COLOUR DAYS BY</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerRow}
      >
        {staff.map((s) => {
          const active = s.id === value;
          return (
            <Pressable
              key={s.id}
              onPress={() => onChange(s.id)}
              style={[
                styles.staffChip,
                {
                  backgroundColor: active ? palette.primary : palette.surface,
                  borderColor: active ? palette.primary : palette.border,
                },
              ]}
            >
              <View style={[styles.staffChipDot, { backgroundColor: s.color || palette.primary }]} />
              <Text
                style={{
                  color: active ? '#fff' : palette.textPrimary,
                  fontWeight: active ? '700' : '600',
                  fontSize: 13,
                }}
              >
                {s.name.split(' ')[0]}
              </Text>
              {s.is_head_trainer ? (
                <Text style={{ color: active ? 'rgba(255,255,255,0.85)' : palette.textMuted, fontSize: 10, fontWeight: '700' }}>HT</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function RosterGrid({
  grid,
  engine,
  staff,
  selStaffId,
  today,
  isTrainer,
  myAvailFor,
  onSelect,
}: {
  grid: (string | null)[];
  engine: ReturnType<typeof makeRoster>;
  staff: StaffMember[];
  selStaffId: string | null;
  today: string;
  isTrainer: boolean;
  myAvailFor: (d: string) => boolean | undefined;
  onSelect: (d: string) => void;
}) {
  const { palette } = useTheme();
  const selName = selStaffId ? staff.find((s) => s.id === selStaffId)?.name.split(' ')[0] : null;
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

          // Selected-staff status — mirrors the web calendar's green/amber/red fill.
          // green = rostered, amber = partial, red = rostered but marked unavailable
          // (a conflict). Days the selected staff isn't on stay plain.
          let status: 'available' | 'partial' | 'unavailable' | null = null;
          let staffIsOn = false;
          if (isTrainer && selStaffId && !holiday) {
            const entry = roster.find((r) => r.staff_id === selStaffId);
            if (entry) {
              const selStaff = staff.find((s) => s.id === selStaffId);
              const active = entry.status === 'available' || entry.status === 'partial';
              const conflict = !!(selStaff && active && !engine.isStaffAvailableOnDate(selStaff, dateStr));
              status = conflict ? 'unavailable' : (entry.status === 'partial' ? 'partial' : 'available');
              staffIsOn = active && !conflict;
            }
          }

          // Assistant view keeps its own-availability dot.
          const myAvail = !isTrainer ? myAvailFor(dateStr) : undefined;

          const bg = holiday
            ? palette.holiday + '22'
            : status === 'available'
              ? palette.successLight
              : status === 'partial'
                ? palette.warningLight
                : status === 'unavailable'
                  ? palette.dangerLight
                  : isToday
                    ? palette.primaryLight
                    : palette.surface;
          const border = isToday
            ? palette.primary
            : status === 'available'
              ? palette.successBorder
              : status === 'partial'
                ? palette.warningBorder
                : status === 'unavailable'
                  ? palette.dangerBorder
                  : holiday
                    ? palette.holiday
                    : palette.border;

          // Class student count: green when the selected staff is on, red when a
          // class is on but they aren't (matches the web tick/cross colouring).
          const clsColor =
            isTrainer && selStaffId && hasClass
              ? staffIsOn
                ? palette.success
                : palette.danger
              : palette.textMuted;

          return (
            <Pressable
              key={i}
              onPress={() => onSelect(dateStr)}
              style={[styles.cell, { backgroundColor: bg, borderColor: border }]}
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
              <View style={styles.cellBody}>
                {holiday ? (
                  <Text style={[styles.phTag, { color: palette.holiday }]}>PH</Text>
                ) : hasClass ? (
                  <Text
                    style={[styles.clsNum, { color: clsColor }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {info.students_am + '/' + info.students_pm}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.legend, { color: palette.textMuted }]}>
        {isTrainer && selName ? (
          <>
            <Text style={{ color: palette.success, fontWeight: '700' }}>Green</Text> = {selName} rostered ·{' '}
            <Text style={{ color: palette.warning, fontWeight: '700' }}>Amber</Text> = partial ·{' '}
            <Text style={{ color: palette.danger, fontWeight: '700' }}>Red</Text> = class on, not rostered. Big numbers are AM/PM students — tap a day for who's on.
          </>
        ) : (
          <>
            Numbers are AM/PM students (PH = public holiday). Tap a day for who's rostered.
            {!isTrainer ? ' Green/red mark your own availability.' : ''}
          </>
        )}
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
  const accentFor = (kind: StatusKind) =>
    kind === 'holiday' ? palette.holiday : kind === 'rostered' ? palette.success : palette.danger;
  return (
    <View style={{ marginTop: spacing(3) }}>
      {days.map((d) => {
        const holiday = engine.isPublicHoliday(d);
        const roster = engine.getRosterForDate(d);
        const info = engine.getEffectiveClassInfo(d);
        const kind: StatusKind = holiday ? 'holiday' : roster.length > 0 ? 'rostered' : 'unstaffed';
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            style={[styles.ovRow, { borderColor: palette.border, backgroundColor: palette.surface2 }]}
          >
            <View style={[styles.ovAccent, { backgroundColor: accentFor(kind) }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
                <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 14, flexShrink: 1 }}>
                  {prettyDateLong(d)}
                </Text>
                <StatusBadge kind={kind} />
              </View>
              <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 3 }}>
                {holiday ? 'Public holiday — no classes' : `${info.students_am}/${info.students_pm} students`}
                {!holiday && roster.length ? ' · ' + roster.map((r) => r.name.split(' ')[0]).join(', ') : ''}
                {!holiday && !roster.length ? ' · no one rostered' : ''}
              </Text>
            </View>
            <Text style={{ color: palette.textMuted, fontSize: 18 }}>›</Text>
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
  hero: { borderRadius: 14, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroDate: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 1 },
  heroRow: { flexDirection: 'row', gap: spacing(6), marginTop: spacing(2) },
  heroStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  heroStatValue: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 1 },
  heroStaff: { marginTop: spacing(2), paddingTop: spacing(2), borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  heroChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  heroEmpty: { color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', fontSize: 14 },
  errorBox: { borderRadius: radius, borderWidth: 1, padding: spacing(3), marginBottom: spacing(3) },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing(4), paddingVertical: spacing(3), borderBottomWidth: 1, gap: spacing(3) },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  pickerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing(2) },
  pickerRow: { flexDirection: 'row', gap: spacing(2), paddingRight: spacing(2) },
  staffChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  staffChipDot: { width: 10, height: 10, borderRadius: 5 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(3), marginBottom: spacing(2) },
  navBtn: { width: 40, height: 40, borderRadius: radius, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: spacing(1) },
  weekHeadCell: { width: CELL_PCT as any, alignItems: 'center' },
  weekHeadText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_PCT as any, aspectRatio: 0.9, borderWidth: 1, borderRadius: 8, padding: 3 },
  cellTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayNum: { fontSize: 13 },
  mine: { width: 7, height: 7, borderRadius: 4 },
  cellBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  clsNum: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  phTag: { fontSize: 12, fontWeight: '800' },
  legend: { fontSize: 12, lineHeight: 17, marginTop: spacing(3) },
  ovRow: { flexDirection: 'row', alignItems: 'center', padding: spacing(3), borderWidth: 1, borderRadius: radius, gap: spacing(3), marginBottom: spacing(2) },
  ovAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
