import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  prettyDateLong,
  prettyDateShortDow,
  prettyTime,
} from '../lib/format';
import { rosteredUserIdsForDate } from '../lib/data';
import { notifyChange } from '../lib/notify';
import { roleLabel } from '../lib/roster';
import { makeRoster, type ComputedEntry, type RosterContext } from '../lib/rosterCompute';
import { supabase } from '../lib/supabase';
import { useTheme } from '../ThemeProvider';
import type { DayClass, Profile } from '../lib/types';
import { radius, spacing, type Palette } from '../theme';
import { Badge, StatusBadge, type StatusKind } from './ui';

type AvailChoice = 'available' | 'unavailable' | 'unset';

interface Props {
  visible: boolean;
  dateStr: string | null;
  session: Session;
  profile: Profile | null;
  ctx: RosterContext | null;
  onClose: () => void;
  onChanged: () => void;
}

export default function DayDetailSheet({
  visible,
  dateStr,
  session,
  profile,
  ctx,
  onClose,
  onChanged,
}: Props) {
  const { palette } = useTheme();
  const isTrainer = profile?.role === 'trainer';
  const userId = session.user.id;
  const actorName = profile?.full_name || session.user.email || 'Someone';

  const engine = useMemo(() => (ctx ? makeRoster(ctx) : null), [ctx]);

  const roster: ComputedEntry[] =
    engine && dateStr ? engine.getRosterForDate(dateStr) : [];
  const info = engine && dateStr ? engine.getEffectiveClassInfo(dateStr) : null;
  const holiday = engine && dateStr ? engine.isPublicHoliday(dateStr) : false;
  const classDay = engine && dateStr ? engine.isClassDay(dateStr) : false;
  const headerKind: StatusKind = holiday
    ? 'holiday'
    : !classDay
      ? 'noclass'
      : roster.length > 0
        ? 'rostered'
        : 'unstaffed';

  // Read-only preview: every assistant's status for this day + their priority.
  // "Rostered" = actually on the roster; "Available" = free that day per their
  // weekly pattern / overrides but not rostered; "Not available" otherwise.
  const assistantPreview = useMemo(() => {
    if (!engine || !dateStr || !ctx) return [];
    const rosteredIds = new Set(
      engine
        .getRosterForDate(dateStr)
        .filter((r) => r.status === 'available' || r.status === 'partial')
        .map((r) => r.staff_id),
    );
    const overrides = ctx.assistantAvailByDate[dateStr] || [];
    const items = ctx.staff
      .filter((s) => !s.is_head_trainer)
      .map((s) => {
        const rostered = rosteredIds.has(s.id);
        const available = engine.isStaffAvailableOnDate(s, dateStr);
        const ov = s.user_id ? overrides.find((e) => e.user_id === s.user_id) : undefined;
        const kind: 'rostered' | 'available' | 'unavailable' = rostered
          ? 'rostered'
          : available
            ? 'available'
            : 'unavailable';
        // Pick priority only applies to AVAILABLE staff, and only when one is
        // actually configured. 100 is the unset default, so we show nothing then
        // rather than fabricating a rank from list order.
        const raw = engine.effectivePriority(s, dateStr);
        const priority = available && raw !== 100 ? raw : null;
        return { id: s.id, name: s.name, color: s.color, priority, note: ov?.note || '', kind };
      });
    // Available first (by real priority, unset ones last, then name); not-available last.
    items.sort((a, b) => {
      const av = a.kind !== 'unavailable';
      const bv = b.kind !== 'unavailable';
      if (av !== bv) return av ? -1 : 1;
      const pa = a.priority ?? 9999;
      const pb = b.priority ?? 9999;
      return pa - pb || a.name.localeCompare(b.name);
    });
    return items;
  }, [engine, dateStr, ctx]);

  // Assistant self-availability
  const [choice, setChoice] = useState<AvailChoice>('unset');
  const [note, setNote] = useState('');
  // Trainer: class numbers
  const [amStr, setAmStr] = useState('0');
  const [pmStr, setPmStr] = useState('0');
  const [cappedAm, setCappedAm] = useState(false);
  const [cappedPm, setCappedPm] = useState(false);
  // What the number fields showed when the day opened (the effective value: per-day row if any,
  // else the weekday default). Used on save to tell which fields were actually changed, so an
  // untouched count is never baked over the real stored number.
  const [snapAm, setSnapAm] = useState(0);
  const [snapPm, setSnapPm] = useState(0);
  // Trainer: roster on/off set of staff_ids
  const [onSet, setOnSet] = useState<Set<string>>(new Set());
  // Editing (class numbers + roster) stays collapsed until deliberately opened,
  // so the modal is a read-only view by default and can't be edited by accident.
  const [editOpen, setEditOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // (Re)initialise all editor state whenever the day, visibility, or data changes.
  useEffect(() => {
    if (!visible || !dateStr || !ctx || !engine) return;
    setStatus(null);
    const my = (ctx.assistantAvailByDate[dateStr] || []).find(
      (e) => e.user_id === userId,
    );
    if (my) {
      setChoice(my.is_available ? 'available' : 'unavailable');
      setNote(my.note || '');
    } else {
      setChoice('unset');
      setNote('');
    }
    const ci = engine.getEffectiveClassInfo(dateStr);
    setAmStr(String(ci.students_am));
    setPmStr(String(ci.students_pm));
    setCappedAm(ci.capped_am);
    setCappedPm(ci.capped_pm);
    setSnapAm(ci.students_am);
    setSnapPm(ci.students_pm);
    setOnSet(new Set(engine.getRosterForDate(dateStr).map((r) => r.staff_id)));
    setEditOpen(false); // always start collapsed so edits are deliberate
  }, [visible, dateStr, ctx, engine, userId]);

  // user_ids rostered on the open day, from the in-memory (pre-change) context.
  function beforeRosterIds(): (string | null | undefined)[] {
    if (!engine || !dateStr || !ctx) return [];
    return engine.getRosterForDate(dateStr).map((r) => ctx.staff.find((s) => s.id === r.staff_id)?.user_id);
  }

  // ---------- assistant self-availability ----------
  async function saveMyAvailability(next: 'available' | 'unavailable') {
    if (!dateStr) return;
    setSaving(true);
    setStatus(null);
    const isAvail = next === 'available';
    const before = beforeRosterIds();
    const { error } = await supabase
      .from('cbd_assistant_availability')
      .upsert(
        { user_id: userId, date: dateStr, is_available: isAvail, note: note.trim() },
        { onConflict: 'user_id,date' },
      );
    if (error) {
      setStatus('Error: ' + error.message);
      setSaving(false);
      return;
    }
    const after = await rosteredUserIdsForDate(dateStr);
    await notifyChange({
      type: 'availability_changed_by_assistant',
      actorId: userId,
      actorName,
      subjectUserId: userId,
      subjectName: actorName,
      affectedUserIds: [...before, ...after],
      title: `${actorName}'s availability changed`,
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
    const before = beforeRosterIds();
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
    const after = await rosteredUserIdsForDate(dateStr);
    await notifyChange({
      type: 'availability_changed_by_assistant',
      actorId: userId,
      actorName,
      subjectUserId: userId,
      subjectName: actorName,
      affectedUserIds: [...before, ...after],
      title: `${actorName}'s availability changed`,
      message: prettyDateShortDow(dateStr) + ' — availability cleared',
      data: { date: dateStr, action: 'self_cleared' },
    });
    setSaving(false);
    setStatus('Availability cleared.');
    onChanged();
  }

  // ---------- trainer: class numbers ----------
  async function saveClassNumbers() {
    if (!dateStr || !ctx) return;
    setSaving(true);
    setStatus(null);
    const am = parseInt(amStr, 10) || 0;
    const pm = parseInt(pmStr, 10) || 0;
    const existing = ctx.dayClasses[dateStr] as DayClass | undefined;
    // Only treat a count as changed when it differs from what the field showed on open. An
    // untouched count keeps the real stored number (or the default when there's no row yet)
    // instead of baking the pre-filled value — so a capped-only save never invents "16 students".
    const amTouched = am !== snapAm;
    const pmTouched = pm !== snapPm;
    const finalAm = amTouched ? am : (existing && existing.students_am != null ? existing.students_am : am);
    const finalPm = pmTouched ? pm : (existing && existing.students_pm != null ? existing.students_pm : pm);
    // Build an explicit before→after list (mirrors the web app) so the notification shows exactly
    // what changed, cleanly, diffed against what the day effectively resolved to before.
    const beforeInfo = engine ? engine.getEffectiveClassInfo(dateStr) : null;
    const changes: { label: string; from: string | number; to: string | number }[] = [];
    if (beforeInfo) {
      if ((beforeInfo.students_am || 0) !== finalAm) changes.push({ label: 'AM students', from: beforeInfo.students_am || 0, to: finalAm });
      if ((beforeInfo.students_pm || 0) !== finalPm) changes.push({ label: 'PM students', from: beforeInfo.students_pm || 0, to: finalPm });
      if (!!beforeInfo.capped_am !== cappedAm) changes.push({ label: 'AM capped', from: beforeInfo.capped_am ? 'Yes' : 'No', to: cappedAm ? 'Yes' : 'No' });
      if (!!beforeInfo.capped_pm !== cappedPm) changes.push({ label: 'PM capped', from: beforeInfo.capped_pm ? 'Yes' : 'No', to: cappedPm ? 'Yes' : 'No' });
    }
    // Nothing actually changed vs what the day already resolves to — don't write a
    // per-day override (which would bake in the weekday default) or fire a notification.
    if (changes.length === 0) {
      setSaving(false);
      setStatus('No changes to save.');
      return;
    }
    const row: Record<string, any> = {
      date: dateStr,
      students_am: finalAm,
      students_pm: finalPm,
      capped_am: cappedAm,
      capped_pm: cappedPm,
      times_manually_set: !!(existing && existing.times_manually_set),
      updated_by: userId,
    };
    // Preserve a manual time override if one exists (upsert replaces the whole row).
    if (existing && existing.times_manually_set) {
      row.am_start_time = existing.am_start_time;
      row.am_end_time = existing.am_end_time;
      row.pm_start_time = existing.pm_start_time;
      row.pm_end_time = existing.pm_end_time;
    }
    const { error } = await supabase
      .from('cbd_day_classes')
      .upsert(row, { onConflict: 'date' });
    if (error) {
      setStatus('Error: ' + error.message);
      setSaving(false);
      return;
    }
    // Let the people working that day know the numbers changed (their roster may
    // shift — e.g. crossing the threshold that adds/removes an assistant).
    const before = beforeRosterIds();
    const after = await rosteredUserIdsForDate(dateStr);
    await notifyChange({
      type: 'class_changed',
      actorId: userId,
      actorName,
      affectedUserIds: [...before, ...after],
      title: 'Class numbers updated',
      message:
        prettyDateShortDow(dateStr) +
        ' — ' +
        (changes.length
          ? changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join(' · ')
          : 'class details updated'),
      data: { date: dateStr, changes, students_am: finalAm, students_pm: finalPm },
    });
    setSaving(false);
    setStatus('Class numbers saved.');
    onChanged();
  }

  // ---------- trainer: roster on/off ----------
  function toggleStaff(id: string, on: boolean) {
    setOnSet((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function saveRoster() {
    if (!dateStr || !ctx || !engine) return;
    setSaving(true);
    setStatus(null);
    const baseline = new Set(
      engine.getRosterForDate(dateStr).map((r) => r.staff_id),
    );
    const times = engine.getEffectiveClassTimes(dateStr);
    const currentEntries: Record<string, ComputedEntry> = {};
    engine.getRosterForDate(dateStr).forEach((r) => {
      currentEntries[r.staff_id] = r;
    });

    const upserts: Record<string, any>[] = [];
    const deletes: string[] = [];
    ctx.staff.forEach((s) => {
      const wantOn = onSet.has(s.id);
      const hadExplicit = !!(ctx.availabilityByStaff[s.id] || {})[dateStr];
      if (wantOn) {
        const e = currentEntries[s.id];
        upserts.push({
          staff_id: s.id,
          date: dateStr,
          status: 'available',
          day_role: s.is_head_trainer ? 'head_trainer' : 'assistant',
          start_time: (e && e.start_time) || times.am_start || null,
          end_time: (e && e.end_time) || times.pm_end || times.am_end || null,
        });
      } else if (hadExplicit) {
        deletes.push(s.id);
      }
    });

    try {
      if (upserts.length) {
        const { error } = await supabase
          .from('cbd_availability')
          .upsert(upserts, { onConflict: 'staff_id,date' });
        if (error) throw error;
      }
      for (const sid of deletes) {
        const { error } = await supabase
          .from('cbd_availability')
          .delete()
          .eq('staff_id', sid)
          .eq('date', dateStr);
        if (error) throw error;
      }
    } catch (e: any) {
      setStatus('Error: ' + (e?.message || 'save failed'));
      setSaving(false);
      return;
    }

    // Notify staff whose on/off state changed. Each changed person is the subject
    // (gets "Your roster was updated"); everyone working that day + Cameron also
    // hears about it, minus the trainer who made the change.
    const changed = ctx.staff.filter(
      (s) => onSet.has(s.id) !== baseline.has(s.id),
    );
    const beforeIds = [...baseline].map((sid) => ctx.staff.find((s) => s.id === sid)?.user_id);
    const afterIds = await rosteredUserIdsForDate(dateStr);
    const affected = [...beforeIds, ...afterIds];
    await Promise.all(
      changed.map((s) => {
        const nowOn = onSet.has(s.id);
        return notifyChange({
          type: 'roster_changed',
          actorId: userId,
          actorName,
          subjectUserId: s.user_id,
          subjectName: s.name,
          affectedUserIds: affected,
          selfTitle: 'Your roster was updated',
          title: `${s.name}'s roster was updated`,
          message:
            prettyDateShortDow(dateStr) +
            ' — ' +
            (nowOn ? 'added to the roster' : 'removed from the roster'),
          data: { date: dateStr, rostered: nowOn },
        });
      }),
    );

    setSaving(false);
    setStatus('Roster saved.');
    onChanged();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: palette.border }]} />
          </View>

          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing(2), flexWrap: 'wrap' }}>
              <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>
                {dateStr ? prettyDateLong(dateStr) : ''}
              </Text>
              {dateStr ? <StatusBadge kind={headerKind} /> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: palette.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: spacing(16) }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Classes */}
            <Text style={[styles.section, { color: palette.textSecondary }]}>
              Classes
            </Text>
            {holiday ? (
              <Text style={{ color: palette.warning, marginBottom: spacing(2) }}>
                Public holiday — no classes.
              </Text>
            ) : info ? (
              <View style={styles.classRow}>
                <Stat label="AM" value={info.students_am} color={palette.textPrimary} muted={palette.textMuted} />
                <Stat label="PM" value={info.students_pm} color={palette.textPrimary} muted={palette.textMuted} />
              </View>
            ) : null}

            {/* Roster */}
            <Text style={[styles.section, { color: palette.textSecondary }]}>
              Rostered
            </Text>
            {roster.length === 0 ? (
              <Text style={{ color: palette.textMuted, marginBottom: spacing(2) }}>
                No one rostered.
              </Text>
            ) : (
              roster.map((r) => (
                <View key={r.staff_id + r.day_role} style={styles.rosterRow}>
                  <View style={[styles.dot, { backgroundColor: r.color || palette.primary }]} />
                  <Text style={[styles.rosterName, { color: palette.textPrimary }]}>
                    {r.name}
                  </Text>
                  <Text style={[styles.rosterMeta, { color: palette.textMuted }]}>
                    {roleLabel(r)}
                    {r.start_time ? ` · ${prettyTime(r.start_time)}` : ''}
                  </Text>
                </View>
              ))
            )}

            {/* Assistant availability + priority preview (read-only) */}
            {!holiday && assistantPreview.length > 0 ? (
              <>
                <Text style={[styles.section, { color: palette.textSecondary }]}>
                  Assistant availability
                </Text>
                {assistantPreview.map((a) => {
                  const tone = (a.kind === 'rostered'
                    ? 'success'
                    : a.kind === 'available'
                      ? 'muted'
                      : 'danger') as 'success' | 'muted' | 'danger';
                  const label =
                    a.kind === 'rostered'
                      ? 'Rostered'
                      : a.kind === 'available'
                        ? 'Available'
                        : 'Not available';
                  return (
                    <View key={a.id} style={styles.previewRow}>
                      <View style={[styles.dot, { backgroundColor: a.color || palette.primary }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: palette.textPrimary, fontWeight: '600', fontSize: 15 }}>
                          {a.name}
                        </Text>
                        {a.priority != null || a.note ? (
                          <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 1 }}>
                            {a.priority != null ? `${ordinal(a.priority)} priority` : ''}
                            {a.priority != null && a.note ? ' · ' : ''}
                            {a.note || ''}
                          </Text>
                        ) : null}
                      </View>
                      <Badge label={label} tone={tone} />
                    </View>
                  );
                })}
                <Text style={[styles.hint, { color: palette.textMuted }]}>
                  Only available staff are ranked. Pick priority is set per weekday in the web app's Priority Order.
                </Text>
              </>
            ) : null}

            {/* Assistant self-availability */}
            {!isTrainer && (
              <View style={[styles.editor, { borderTopColor: palette.border }]}>
                <Text style={[styles.section, { color: palette.textSecondary }]}>
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
                    disabled={saving}
                    onPress={() => saveMyAvailability('unavailable')}
                  />
                </View>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Optional note for trainers"
                  placeholderTextColor={palette.textMuted}
                  editable={!saving}
                  style={[
                    styles.input,
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

            {/* Trainer: class numbers + roster editing — collapsed by default so the
                modal reads as a summary and can't be edited by accident. */}
            {isTrainer && !holiday && (
              <View style={[styles.editor, { borderTopColor: palette.border }]}>
                <Pressable onPress={() => setEditOpen((o) => !o)} style={styles.expanderHeader}>
                  <Text style={[styles.section, { color: palette.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                    Edit day
                  </Text>
                  <Text style={{ color: palette.primary, fontSize: 14, fontWeight: '700' }}>
                    {editOpen ? 'Hide ▾' : 'Edit ▸'}
                  </Text>
                </Pressable>

                {!editOpen ? (
                  <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: spacing(2) }}>
                    Tap Edit to change class numbers or the roster for this day.
                  </Text>
                ) : (
                  <View style={{ marginTop: spacing(1) }}>
                    <Text style={[styles.section, { color: palette.textSecondary }]}>
                      Class numbers
                    </Text>
                    <View style={styles.numRow}>
                      <NumField
                        label="AM students"
                        value={amStr}
                        onChange={setAmStr}
                        palette={palette}
                        disabled={saving}
                      />
                      <NumField
                        label="PM students"
                        value={pmStr}
                        onChange={setPmStr}
                        palette={palette}
                        disabled={saving}
                      />
                    </View>
                    <View style={styles.capRow}>
                      <ToggleRow
                        label="AM capped"
                        value={cappedAm}
                        onValueChange={setCappedAm}
                        palette={palette}
                        disabled={saving}
                      />
                      <ToggleRow
                        label="PM capped"
                        value={cappedPm}
                        onValueChange={setCappedPm}
                        palette={palette}
                        disabled={saving}
                      />
                    </View>
                    <PrimaryButton
                      label="Save class numbers"
                      palette={palette}
                      disabled={saving}
                      onPress={saveClassNumbers}
                    />

                    <Text
                      style={[
                        styles.section,
                        { color: palette.textSecondary, marginTop: spacing(5) },
                      ]}
                    >
                      Roster
                    </Text>
                    {ctx?.staff.map((s) => {
                      const on = onSet.has(s.id);
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => { if (!saving) toggleStaff(s.id, !on); }}
                          style={[
                            styles.staffToggleRow,
                            {
                              backgroundColor: on ? palette.successLight : palette.surface2,
                              borderColor: on ? palette.successBorder : palette.border,
                            },
                          ]}
                        >
                          <View style={[styles.dot, { backgroundColor: s.color || palette.primary }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: palette.textPrimary, fontWeight: '600' }}>
                              {s.name}
                            </Text>
                            <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                              {s.is_head_trainer ? 'Head Trainer' : 'Assistant'}
                            </Text>
                          </View>
                          <Switch
                            value={on}
                            onValueChange={(v) => toggleStaff(s.id, v)}
                            disabled={saving}
                            trackColor={{ true: palette.success, false: palette.border }}
                          />
                        </Pressable>
                      );
                    })}
                    <PrimaryButton
                      label="Save roster"
                      palette={palette}
                      disabled={saving}
                      onPress={saveRoster}
                    />
                    <Text style={[styles.hint, { color: palette.textMuted }]}>
                      Saving pins this day's roster. Future weekends still follow the
                      head-trainer rotation rule.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {status ? (
              <Text style={[styles.status, { color: palette.textSecondary }]}>
                {status}
              </Text>
            ) : null}
          </ScrollView>
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
  palette: Palette;
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
      <Text style={{ color: active ? '#fff' : palette.textPrimary, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function NumField({
  label,
  value,
  onChange,
  palette,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  palette: Palette;
  disabled?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.numLabel, { color: palette.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        editable={!disabled}
        style={[
          styles.input,
          {
            backgroundColor: palette.surface2,
            borderColor: palette.border,
            color: palette.textPrimary,
          },
        ]}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  palette,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  palette: Palette;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={{ color: palette.textSecondary }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: palette.primary, false: palette.border }}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  palette,
  disabled,
  onPress,
}: {
  label: string;
  palette: Palette;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.primaryBtn,
        { backgroundColor: palette.primary, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

// 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", ... (for pick-priority labels).
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(6),
    maxHeight: '90%',
  },
  grabber: { alignItems: 'center', paddingVertical: spacing(2) },
  grabberBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(2),
  },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
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
  rosterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing(3) },
  rosterName: { fontSize: 15, fontWeight: '600', flex: 1 },
  rosterMeta: { fontSize: 13 },
  editor: { borderTopWidth: 1, marginTop: spacing(4), paddingTop: spacing(1) },
  choiceRow: { flexDirection: 'row', gap: spacing(3) },
  choiceBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: spacing(3),
    alignItems: 'center',
  },
  lockNote: { fontSize: 13, marginTop: spacing(3) },
  input: {
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 15,
    marginTop: spacing(2),
  },
  numRow: { flexDirection: 'row', gap: spacing(3) },
  numLabel: { fontSize: 13, fontWeight: '600' },
  capRow: { flexDirection: 'row', gap: spacing(6), marginTop: spacing(3) },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  primaryBtn: {
    marginTop: spacing(4),
    borderRadius: radius,
    paddingVertical: spacing(3),
    alignItems: 'center',
  },
  staffToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    borderWidth: 1,
    borderRadius: radius,
    marginBottom: spacing(2),
  },
  hint: { fontSize: 12, marginTop: spacing(3), lineHeight: 17 },
  status: { marginTop: spacing(4), fontSize: 14 },
  expanderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(2) },
});
