import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import StaffModal from '../components/StaffModal';
import { Badge, Btn, Card, CardHeader, EmptyNote, Pills, StatusBadge } from '../components/ui';
import { loadSettings } from '../lib/data';
import { prettyDateLong, todayStr } from '../lib/format';
import { notifyStaffOfRosterChange } from '../lib/notify';
import { supabase } from '../lib/supabase';
import type { Profile, Settings, StaffMember } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

type Sub = 'manage' | 'availability';
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_SHORT: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

export default function StaffScreen({ session, profile }: { session: Session; profile: Profile | null }) {
  const { palette } = useTheme();
  const [sub, setSub] = useState<Sub>('manage');
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    const [staffRes, profRes, s] = await Promise.all([
      supabase.from('cbd_staff_members').select('*').order('priority', { ascending: true }),
      supabase.from('cbd_profiles').select('id, full_name, role, available_dows'),
      loadSettings(),
    ]);
    setStaff((staffRes.data || []) as StaffMember[]);
    setProfiles((profRes.data || []) as Profile[]);
    setSettings(s);
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  if (loading || !settings) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <View style={{ padding: spacing(3), paddingBottom: 0 }}>
        <Pills options={[{ key: 'manage' as Sub, label: 'Manage Staff' }, { key: 'availability' as Sub, label: 'Availability' }]} value={sub} onChange={setSub} />
      </View>
      {sub === 'manage' ? (
        <ManageStaff
          session={session}
          staff={staff}
          profiles={profiles}
          settings={settings}
          onReload={load}
          onAdd={() => { setEditing(null); setModalOpen(true); }}
          onEdit={(s) => { setEditing(s); setModalOpen(true); }}
        />
      ) : (
        <AvailabilityTab session={session} profile={profile} staff={staff} profiles={profiles} onReload={load} />
      )}

      <StaffModal
        visible={modalOpen}
        editing={editing}
        profiles={profiles}
        staff={staff}
        currentUserId={session.user.id}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </View>
  );
}

function ManageStaff({
  session, staff, profiles, settings, onReload, onAdd, onEdit,
}: {
  session: Session; staff: StaffMember[]; profiles: Profile[]; settings: Settings; onReload: () => void;
  onAdd: () => void; onEdit: (s: StaffMember) => void;
}) {
  const { palette } = useTheme();
  const hts = staff.filter((s) => s.is_head_trainer);
  const [min1, setMin1] = useState(String(settings.min_students_for_one_assistant ?? 8));
  const [min2, setMin2] = useState(String(settings.min_students_for_two_assistants ?? 16));
  const [firstSat, setFirstSat] = useState<string | null>(settings.weekend_first_sat_ht_id || null);
  const [slots, setSlots] = useState<Record<string, string>>(
    { '1': '', '2': '', '3': '', '4': '', ...(settings.assistant_slot_times as any || {}) },
  );
  const [savingRules, setSavingRules] = useState(false);
  const [savingSlots, setSavingSlots] = useState(false);

  const profName = (uid: string | null) => profiles.find((p) => p.id === uid)?.full_name;

  async function saveRules() {
    const r1 = parseInt(min1, 10) || 0;
    const r2 = parseInt(min2, 10) || 0;
    if (r2 < r1) { Alert.alert('Check values', 'The 2-assistant threshold should be ≥ the 1-assistant threshold.'); return; }
    setSavingRules(true);
    const { error } = await supabase
      .from('cbd_auto_roster_rules')
      .update({ min_students_for_one_assistant: r1, min_students_for_two_assistants: r2, weekend_first_sat_ht_id: firstSat, updated_by: session.user.id })
      .eq('id', 1);
    setSavingRules(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Saved', 'Auto-roster rules updated.');
    onReload();
  }

  async function saveSlots() {
    setSavingSlots(true);
    const { error } = await supabase
      .from('cbd_auto_roster_rules')
      .update({ assistant_slot_times: slots, updated_by: session.user.id })
      .eq('id', 1);
    setSavingSlots(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Saved', 'Assistant start times updated.');
    onReload();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12), gap: spacing(3) }}>
      <Card>
        <CardHeader title="Staff Members" subtitle={`${staff.length} people`} right={<Btn label="+ Add" size="sm" onPress={onAdd} />} />
        <View style={{ padding: spacing(3) }}>
          {staff.length === 0 ? <EmptyNote>No staff yet.</EmptyNote> : staff.map((s) => (
            <Pressable key={s.id} onPress={() => onEdit(s)} style={[styles.staffRow, { borderBottomColor: palette.border }]}>
              <View style={[styles.avatar, { backgroundColor: s.color || palette.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{initials(s.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), flexWrap: 'wrap' }}>
                  <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 15 }}>{s.name}</Text>
                  {s.is_head_trainer ? <Badge label="HT" tone="primary" /> : null}
                  <Badge label={`P${s.priority ?? 100}`} tone="muted" />
                </View>
                <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}>
                  {(s.role || 'Staff')}{s.user_id ? ` · linked${profName(s.user_id) ? ' to ' + profName(s.user_id) : ''}` : ' · no login'}
                </Text>
              </View>
              <Text style={{ color: palette.textMuted }}>›</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <CardHeader title="Auto-roster Rules" subtitle="How many assistants a class needs." />
        <View style={{ padding: spacing(4), gap: spacing(3) }}>
          <NumRow label="Need 1 assistant when class ≥" value={min1} onChange={setMin1} palette={palette} />
          <NumRow label="Need 2 assistants when class ≥" value={min2} onChange={setMin2} palette={palette} />
          <Text style={{ color: palette.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing(1) }}>
            Head trainer who starts the Saturday rotation
          </Text>
          <View style={{ gap: spacing(2) }}>
            {hts.map((h) => (
              <Pressable key={h.id} onPress={() => setFirstSat(h.id)} style={[styles.opt, { borderColor: firstSat === h.id ? palette.primary : palette.border, backgroundColor: firstSat === h.id ? palette.primaryLight : palette.surface2 }]}>
                <Text style={{ color: firstSat === h.id ? palette.primaryDark : palette.textPrimary }}>{h.name}</Text>
              </Pressable>
            ))}
          </View>
          <Btn label="Save Rules" busy={savingRules} onPress={saveRules} />
        </View>
      </Card>

      <Card>
        <CardHeader title="Assistant Start Times by Slot" subtitle="When each assistant slot starts." />
        <View style={{ padding: spacing(4), gap: spacing(2) }}>
          {['1', '2', '3', '4'].map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
              <Text style={{ color: palette.textSecondary, width: 90 }}>{ordinal(k)} picked</Text>
              <TextInput
                value={slots[k] || ''}
                onChangeText={(v) => setSlots((p) => ({ ...p, [k]: v }))}
                placeholder="HH:MM"
                placeholderTextColor={palette.textMuted}
                style={[styles.input, { flex: 1, backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
              />
            </View>
          ))}
          <Btn label="Save Start Times" busy={savingSlots} onPress={saveSlots} style={{ marginTop: spacing(2) }} />
        </View>
      </Card>
    </ScrollView>
  );
}

function AvailabilityTab({
  session, profile, staff, profiles, onReload,
}: {
  session: Session; profile: Profile | null; staff: StaffMember[]; profiles: Profile[]; onReload: () => void;
}) {
  const { palette } = useTheme();
  // Weekly patterns: editable copy of each linked profile's available_dows.
  const linked = staff.filter((s) => s.user_id);
  const [patterns, setPatterns] = useState<Record<string, number[]>>({});
  const [savingPat, setSavingPat] = useState(false);
  const [selAssistId, setSelAssistId] = useState<string | null>(null);

  useEffect(() => {
    const init: Record<string, number[]> = {};
    linked.forEach((s) => {
      const prof = profiles.find((p) => p.id === s.user_id);
      init[s.id] = Array.isArray(prof?.available_dows) ? [...(prof!.available_dows as number[])] : [0, 1, 2, 3, 4, 5, 6];
    });
    setPatterns(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, profiles]);

  function toggleDow(staffId: string, dow: number) {
    setPatterns((prev) => {
      const cur = prev[staffId] || [];
      const has = cur.includes(dow);
      return { ...prev, [staffId]: has ? cur.filter((d) => d !== dow) : [...cur, dow].sort() };
    });
  }

  async function savePatterns() {
    setSavingPat(true);
    const updates: any[] = [];
    linked.forEach((s) => {
      const prof = profiles.find((p) => p.id === s.user_id);
      const before = JSON.stringify(Array.isArray(prof?.available_dows) ? prof!.available_dows : [0, 1, 2, 3, 4, 5, 6]);
      const after = JSON.stringify(patterns[s.id] || []);
      if (before !== after && s.user_id) {
        updates.push(supabase.from('cbd_profiles').update({ available_dows: patterns[s.id] }).eq('id', s.user_id));
      }
    });
    const results = await Promise.all(updates);
    setSavingPat(false);
    const err = results.find((r) => r.error);
    if (err) { Alert.alert('Error', err.error.message); return; }
    Alert.alert('Saved', `Updated ${updates.length} pattern${updates.length === 1 ? '' : 's'}.`);
    onReload();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12), gap: spacing(3) }}>
      <Card>
        <CardHeader title="Weekly Availability Patterns" subtitle="Which days each person normally works." />
        <View style={{ padding: spacing(3) }}>
          {linked.length === 0 ? <EmptyNote>No linked staff.</EmptyNote> : linked.map((s) => (
            <View key={s.id} style={[styles.patRow, { borderBottomColor: palette.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(2) }}>
                <View style={[styles.dot, { backgroundColor: s.color || palette.primary }]} />
                <Text style={{ color: palette.textPrimary, fontWeight: '600' }}>{s.name}</Text>
                {s.is_head_trainer ? <Badge label="HT" tone="primary" /> : null}
              </View>
              <View style={styles.dowPills}>
                {DOW_ORDER.map((dow) => {
                  const on = (patterns[s.id] || []).includes(dow);
                  return (
                    <Pressable key={dow} onPress={() => toggleDow(s.id, dow)} style={[styles.dowPill, { backgroundColor: on ? palette.success : palette.surface2, borderColor: on ? palette.success : palette.border }]}>
                      <Text style={{ color: on ? '#fff' : palette.textSecondary, fontSize: 12, fontWeight: '600' }}>{DOW_SHORT[dow]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {linked.length > 0 ? <Btn label="Save All Patterns" busy={savingPat} onPress={savePatterns} style={{ marginTop: spacing(3) }} /> : null}
        </View>
      </Card>

      <Card>
        <CardHeader title="One-off Date Overrides" subtitle="Mark a specific day off/on for an assistant." />
        <View style={{ padding: spacing(3) }}>
          <Text style={{ color: palette.textSecondary, fontSize: 13, marginBottom: spacing(2) }}>Select an assistant:</Text>
          <View style={{ gap: spacing(2) }}>
            {staff.filter((s) => !s.is_head_trainer && s.user_id).map((s) => (
              <Pressable key={s.id} onPress={() => setSelAssistId(s.id === selAssistId ? null : s.id)} style={[styles.opt, { borderColor: selAssistId === s.id ? palette.primary : palette.border, backgroundColor: selAssistId === s.id ? palette.primaryLight : palette.surface2 }]}>
                <Text style={{ color: selAssistId === s.id ? palette.primaryDark : palette.textPrimary }}>{s.name}</Text>
              </Pressable>
            ))}
          </View>
          {selAssistId ? (
            <OverrideEditor
              session={session}
              profile={profile}
              staff={staff.find((s) => s.id === selAssistId)!}
              onChanged={onReload}
            />
          ) : null}
        </View>
      </Card>
    </ScrollView>
  );
}

// A simple upcoming-days list where a trainer sets an assistant's availability per day.
function OverrideEditor({
  session, profile, staff, onChanged,
}: {
  session: Session; profile: Profile | null; staff: StaffMember; onChanged: () => void;
}) {
  const { palette } = useTheme();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const loadOv = useCallback(async () => {
    if (!staff.user_id) return;
    const start = todayStr();
    const { data } = await supabase
      .from('cbd_assistant_availability')
      .select('date, is_available')
      .eq('user_id', staff.user_id)
      .gte('date', start)
      .order('date');
    const map: Record<string, boolean> = {};
    ((data || []) as { date: string; is_available: boolean }[]).forEach((r) => { map[r.date] = r.is_available; });
    setOverrides(map);
  }, [staff.user_id]);

  useEffect(() => { loadOv(); }, [loadOv]);

  // Next 21 days.
  const days: string[] = [];
  const base = new Date();
  for (let i = 0; i < 21; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  function setDay(date: string, choice: 'available' | 'unavailable' | 'clear') {
    if (!staff.user_id) return;
    (async () => {
      const actorName = profile?.full_name || 'A trainer';
      if (choice === 'clear') {
        await supabase.from('cbd_assistant_availability').delete().eq('user_id', staff.user_id).eq('date', date);
      } else {
        await supabase.from('cbd_assistant_availability').upsert(
          { user_id: staff.user_id, date, is_available: choice === 'available', note: '' },
          { onConflict: 'user_id,date' },
        );
      }
      await notifyStaffOfRosterChange({
        targetUserId: staff.user_id,
        actorId: session.user.id,
        actorName,
        subjectName: staff.name,
        type: 'availability_changed_by_trainer',
        title: 'Your availability was updated',
        message: `${prettyDateLong(date)} — ${choice === 'clear' ? 'cleared' : choice === 'available' ? 'Available' : 'Not available'}`,
        data: { date, action: 'trainer_set' },
      });
      setMsg(`${prettyDateLong(date)} updated.`);
      await loadOv();
      onChanged();
    })();
  }

  function tap(date: string) {
    Alert.alert(prettyDateLong(date), `Set ${staff.name}'s availability`, [
      { text: 'Available', onPress: () => setDay(date, 'available') },
      { text: 'Not available', onPress: () => setDay(date, 'unavailable') },
      { text: 'Clear', style: 'destructive', onPress: () => setDay(date, 'clear') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={{ marginTop: spacing(3) }}>
      {msg ? <Text style={{ color: palette.success, fontSize: 12, marginBottom: spacing(2) }}>{msg}</Text> : null}
      {days.map((d) => {
        const ov = overrides[d];
        return (
          <Pressable key={d} onPress={() => tap(d)} style={[styles.ovDayRow, { borderBottomColor: palette.border }]}>
            <Text style={{ color: palette.textPrimary, flex: 1, fontSize: 14 }}>{prettyDateLong(d)}</Text>
            <StatusBadge kind={ov === false ? 'unavailable' : ov === true ? 'available' : 'pattern'} />
          </Pressable>
        );
      })}
    </View>
  );
}

function NumRow({ label, value, onChange, palette }: { label: string; value: string; onChange: (v: string) => void; palette: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
      <Text style={{ color: palette.textSecondary, flex: 1, fontSize: 14 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        style={[styles.input, { width: 70, textAlign: 'center', backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
      />
    </View>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
function ordinal(k: string): string {
  return ({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' } as Record<string, string>)[k] || k;
}

const styles = StyleSheet.create({
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(3), borderBottomWidth: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2), fontSize: 15 },
  opt: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(3) },
  patRow: { paddingVertical: spacing(3), borderBottomWidth: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dowPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) },
  dowPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  ovDayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(3), borderBottomWidth: 1 },
});
