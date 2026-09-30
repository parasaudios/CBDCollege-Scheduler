import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import {
  daysUntil,
  prettyDateLong,
  prettyDateShortDow,
  prettyTime,
} from '../lib/format';
import { notifyTrainersOfAssistantChange } from '../lib/notify';
import { buildExplicitRoster, roleLabel } from '../lib/roster';
import { supabase } from '../lib/supabase';
import type {
  AvailabilityRow,
  DayClass,
  Profile,
  RosterEntry,
  StaffMember,
} from '../lib/types';
import { paletteFor, radius, spacing } from '../theme';

const LOCK_DAYS = 14; // mirrors web ASSISTANT_UNAVAIL_LOCK_DAYS

type AvailChoice = 'available' | 'unavailable' | 'unset';

interface Props {
  visible: boolean;
  dateStr: string | null;
  session: Session;
  profile: Profile | null;
  staff: StaffMember[];
  onClose: () => void;
  onChanged: () => void;
}

export default function DayDetailSheet({
  visible,
  dateStr,
  session,
  profile,
  staff,
  onClose,
  onChanged,
}: Props) {
  const palette = paletteFor(useColorScheme());
  const isTrainer = profile?.role === 'trainer';
  const userId = session.user.id;

  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [dayClass, setDayClass] = useState<DayClass | null>(null);
  const [choice, setChoice] = useState<AvailChoice>('unset');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dateStr) return;
    setLoading(true);
    setStatus(null);
    try {
      const [availRes, classRes, myAvailRes] = await Promise.all([
        supabase.from('cbd_availability').select('*').eq('date', dateStr),
        supabase
          .from('cbd_day_classes')
          .select('*')
          .eq('date', dateStr)
          .maybeSingle(),
        supabase
          .from('cbd_assistant_availability')
          .select('*')
          .eq('user_id', userId)
          .eq('date', dateStr)
          .maybeSingle(),
      ]);
      setRoster(
        buildExplicitRoster((availRes.data || []) as AvailabilityRow[], staff),
      );
      setDayClass((classRes.data as DayClass) || null);
      const my = myAvailRes.data as { is_available: boolean; note: string } | null;
      if (my) {
        setChoice(my.is_available ? 'available' : 'unavailable');
        setNote(my.note || '');
      } else {
        setChoice('unset');
        setNote('');
      }
    } catch {
      setStatus('Could not load this day.');
    }
    setLoading(false);
  }, [dateStr, staff, userId]);

  useEffect(() => {
    if (visible && dateStr) load();
  }, [visible, dateStr, load]);

  const locked =
    !isTrainer && dateStr != null && daysUntil(dateStr) < LOCK_DAYS;

  async function saveMyAvailability(next: 'available' | 'unavailable') {
    if (!dateStr) return;
    if (next === 'unavailable' && locked) {
      setStatus(
        `Too close to the date — dates within ${LOCK_DAYS} days can only be changed by a trainer.`,
      );
      return;
    }
    setSaving(true);
    setStatus(null);
    const isAvail = next === 'available';
    const row = {
      user_id: userId,
      date: dateStr,
      is_available: isAvail,
      note: note.trim(),
    };
    const { error } = await supabase
      .from('cbd_assistant_availability')
      .upsert(row, { onConflict: 'user_id,date' });
    if (error) {
      setStatus('Error: ' + error.message);
      setSaving(false);
      return;
    }
    setChoice(next);
    const actorName = profile?.full_name || session.user.email || 'An assistant';
    await notifyTrainersOfAssistantChange(userId, actorName, {
      title: `${actorName} updated their availability`,
      message:
        prettyDateShortDow(dateStr) +
        ' — ' +
        (isAvail ? 'Available' : 'Not available') +
        (note.trim() ? ` — "${note.trim()}"` : ''),
      data: { date: dateStr, is_available: isAvail, note: note.trim(), action: 'self_set' },
    });
    setSaving(false);
    setStatus('Availability saved.');
    onChanged();
  }

  async function clearMyAvailability() {
    if (!dateStr) return;
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from('cbd_assistant_availability')
      .delete()
      .eq('user_id', userId)
      .eq('date', dateStr);
    if (error) {
      setStatus('Error: ' + error.message);
      setSaving(false);
      return;
    }
    setChoice('unset');
    setNote('');
    const actorName = profile?.full_name || session.user.email || 'An assistant';
    await notifyTrainersOfAssistantChange(userId, actorName, {
      title: `${actorName} updated their availability`,
      message: prettyDateShortDow(dateStr) + ' — availability cleared',
      data: { date: dateStr, action: 'self_cleared' },
    });
    setSaving(false);
    setStatus('Availability cleared.');
    onChanged();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.grabber}>
            <View
              style={[styles.grabberBar, { backgroundColor: palette.border }]}
            />
          </View>

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>
              {dateStr ? prettyDateLong(dateStr) : ''}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: palette.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={{ padding: spacing(8), alignItems: 'center' }}>
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: spacing(8) }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Class numbers */}
              <Text style={[styles.section, { color: palette.textSecondary }]}>
                Classes
              </Text>
              {dayClass ? (
                <View style={styles.classRow}>
                  <Stat
                    label="AM"
                    value={dayClass.students_am ?? 0}
                    color={palette.textPrimary}
                    muted={palette.textMuted}
                  />
                  <Stat
                    label="PM"
                    value={dayClass.students_pm ?? 0}
                    color={palette.textPrimary}
                    muted={palette.textMuted}
                  />
                </View>
              ) : (
                <Text style={{ color: palette.textMuted, marginBottom: spacing(3) }}>
                  No class record.
                </Text>
              )}

              {/* Roster */}
              <Text style={[styles.section, { color: palette.textSecondary }]}>
                Rostered
              </Text>
              {roster.length === 0 ? (
                <Text style={{ color: palette.textMuted, marginBottom: spacing(3) }}>
                  No one rostered yet.
                </Text>
              ) : (
                roster.map((r) => (
                  <View key={r.staff_id} style={styles.rosterRow}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: r.color || palette.primary },
                      ]}
                    />
                    <Text
                      style={[styles.rosterName, { color: palette.textPrimary }]}
                    >
                      {r.name}
                    </Text>
                    <Text
                      style={[styles.rosterMeta, { color: palette.textMuted }]}
                    >
                      {roleLabel(r)}
                      {r.start_time ? ` · ${prettyTime(r.start_time)}` : ''}
                    </Text>
                  </View>
                ))
              )}

              {/* Assistant self-availability editor */}
              {!isTrainer && (
                <View
                  style={[
                    styles.editor,
                    { borderTopColor: palette.border },
                  ]}
                >
                  <Text
                    style={[styles.section, { color: palette.textSecondary }]}
                  >
                    My availability
                  </Text>
                  <View style={styles.choiceRow}>
                    <ChoiceButton
                      label="Available"
                      active={choice === 'available'}
                      activeBg={palette.success}
                      palette={palette}
                      disabled={saving}
                      onPress={() => saveMyAvailability('available')}
                    />
                    <ChoiceButton
                      label="Not available"
                      active={choice === 'unavailable'}
                      activeBg={palette.danger}
                      palette={palette}
                      disabled={saving || locked}
                      onPress={() => saveMyAvailability('unavailable')}
                    />
                  </View>

                  {locked ? (
                    <Text style={[styles.lockNote, { color: palette.warning }]}>
                      Within {LOCK_DAYS} days — to mark yourself unavailable,
                      please speak to a trainer.
                    </Text>
                  ) : null}

                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Optional note for trainers"
                    placeholderTextColor={palette.textMuted}
                    editable={!saving}
                    style={[
                      styles.noteInput,
                      {
                        backgroundColor: palette.surface2,
                        borderColor: palette.border,
                        color: palette.textPrimary,
                      },
                    ]}
                  />

                  {choice !== 'unset' ? (
                    <Pressable
                      onPress={clearMyAvailability}
                      disabled={saving}
                      style={{ marginTop: spacing(3), alignSelf: 'flex-start' }}
                    >
                      <Text style={{ color: palette.textMuted }}>
                        Clear my entry for this day
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )}

              {status ? (
                <Text style={[styles.status, { color: palette.textSecondary }]}>
                  {status}
                </Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Stat({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: number;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: muted }]}>{label} students</Text>
    </View>
  );
}

function ChoiceButton({
  label,
  active,
  activeBg,
  palette,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  activeBg: string;
  palette: ReturnType<typeof paletteFor>;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.choiceBtn,
        {
          backgroundColor: active ? activeBg : palette.surface2,
          borderColor: active ? activeBg : palette.border,
          opacity: disabled && !active ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: active ? '#fff' : palette.textPrimary,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(4),
    maxHeight: '85%',
  },
  grabber: { alignItems: 'center', paddingVertical: spacing(2) },
  grabberBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(2),
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing(4),
    marginBottom: spacing(2),
  },
  classRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(2),
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing(3) },
  rosterName: { fontSize: 15, fontWeight: '600', flex: 1 },
  rosterMeta: { fontSize: 13 },
  editor: {
    borderTopWidth: 1,
    marginTop: spacing(4),
    paddingTop: spacing(1),
  },
  choiceRow: { flexDirection: 'row', gap: spacing(3) },
  choiceBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: spacing(3),
    alignItems: 'center',
  },
  lockNote: { fontSize: 13, marginTop: spacing(3) },
  noteInput: {
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 15,
    marginTop: spacing(3),
  },
  status: { marginTop: spacing(4), fontSize: 14 },
});
