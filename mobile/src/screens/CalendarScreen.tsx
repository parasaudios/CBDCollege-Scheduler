import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import DayDetailSheet from '../components/DayDetailSheet';
import { loadRosterContext } from '../lib/data';
import {
  buildMonthGrid,
  monthLabel,
  todayStr,
  WEEKDAY_HEADERS,
} from '../lib/format';
import { makeRoster, type RosterContext } from '../lib/rosterCompute';
import type { Profile } from '../lib/types';
import { paletteFor, radius, spacing, type Palette } from '../theme';

interface Props {
  session: Session;
  profile: Profile | null;
}

export default function CalendarScreen({ session, profile }: Props) {
  const palette = paletteFor(useColorScheme());
  const isTrainer = profile?.role === 'trainer';
  const userId = session.user.id;
  const today = todayStr();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<RosterContext | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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

  function step(delta: number) {
    let m = month0 + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth0(m);
    setYear(y);
  }

  function goToday() {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  function myAvailFor(dateStr: string): boolean | undefined {
    if (!ctx) return undefined;
    const entry = (ctx.assistantAvailByDate[dateStr] || []).find(
      (e) => e.user_id === userId,
    );
    return entry ? entry.is_available : undefined;
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
          Roster calendar
        </Text>
        <View style={styles.nav}>
          <NavBtn label="‹" palette={palette} onPress={() => step(-1)} />
          <Pressable onPress={goToday} style={styles.monthLabelWrap}>
            <Text style={[styles.monthLabel, { color: palette.textPrimary }]}>
              {monthLabel(year, month0)}
            </Text>
          </Pressable>
          <NavBtn label="›" palette={palette} onPress={() => step(1)} />
        </View>
      </View>

      {loading || !engine ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing(3) }}>
          {error ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: palette.dangerLight, borderColor: palette.danger },
              ]}
            >
              <Text style={{ color: palette.danger }}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.weekRow}>
            {WEEKDAY_HEADERS.map((w, i) => (
              <View key={i} style={styles.weekHeadCell}>
                <Text style={[styles.weekHeadText, { color: palette.textMuted }]}>
                  {w}
                </Text>
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
                info.from_default === false ||
                info.students_am > 0 ||
                info.students_pm > 0 ||
                info.capped_am ||
                info.capped_pm;
              const roster = engine.getRosterForDate(dateStr);
              const dots = roster.slice(0, 4);
              const myAvail = myAvailFor(dateStr);
              return (
                <Pressable
                  key={i}
                  onPress={() => setSelected(dateStr)}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: isToday ? palette.primaryLight : palette.surface,
                      borderColor: isToday ? palette.primary : palette.border,
                    },
                  ]}
                >
                  <View style={styles.cellTop}>
                    <Text
                      style={[
                        styles.dayNum,
                        {
                          color: isToday ? palette.primaryDark : palette.textPrimary,
                          fontWeight: isToday ? '800' : '600',
                        },
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
                    <Text style={[styles.clsBadge, { color: palette.warning }]}>PH</Text>
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
                        ]}
                      />
                    ))}
                    {roster.length > 4 ? (
                      <Text style={[styles.more, { color: palette.textMuted }]}>
                        +{roster.length - 4}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            <Text style={[styles.legendText, { color: palette.textMuted }]}>
              Numbers are AM/PM students (PH = public holiday). Dots are rostered
              staff.{!isTrainer ? ' Green/red mark your own availability.' : ''}
            </Text>
          </View>
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

function NavBtn({
  label,
  palette,
  onPress,
}: {
  label: string;
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.navBtn, { borderColor: palette.border }]}
    >
      <Text style={{ color: palette.textPrimary, fontSize: 20, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const CELL_PCT = `${100 / 7}%`;

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing(12),
    paddingBottom: spacing(3),
    paddingHorizontal: spacing(4),
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', marginBottom: spacing(2) },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabelWrap: { flex: 1, alignItems: 'center' },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    borderRadius: radius,
    borderWidth: 1,
    padding: spacing(3),
    marginBottom: spacing(3),
  },
  weekRow: { flexDirection: 'row', marginBottom: spacing(1) },
  weekHeadCell: { width: CELL_PCT as any, alignItems: 'center' },
  weekHeadText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL_PCT as any,
    aspectRatio: 0.82,
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
  },
  cellTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayNum: { fontSize: 13 },
  mine: { width: 7, height: 7, borderRadius: 4 },
  clsBadge: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  dotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 'auto',
    gap: 2,
  },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  more: { fontSize: 9, marginLeft: 1 },
  legend: { marginTop: spacing(3), paddingHorizontal: spacing(1) },
  legendText: { fontSize: 12, lineHeight: 17 },
});
