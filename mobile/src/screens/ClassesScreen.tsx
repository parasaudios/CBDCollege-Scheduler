import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Btn, Card, CardHeader } from '../components/ui';
import { loadSettings } from '../lib/data';
import { prettyDateLong } from '../lib/format';
import { emitNotification } from '../lib/notify';
import { supabase } from '../lib/supabase';
import type { DowDefault, Profile, Settings } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABELS: Record<number, string> = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 0: 'Sunday',
};

interface Holiday { date: string; label: string }

export default function ClassesScreen({ session, profile }: { session: Session; profile: Profile | null }) {
  const { palette } = useTheme();
  const [loading, setLoading] = useState(true);
  const [dct, setDct] = useState<Record<string, DowDefault>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [phDate, setPhDate] = useState('');
  const [phLabel, setPhLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s: Settings = await loadSettings();
    setDct(JSON.parse(JSON.stringify(s.default_class_times || {})));
    const { data } = await supabase
      .from('cbd_public_holidays')
      .select('date, label')
      .order('date', { ascending: true });
    setHolidays((data || []) as Holiday[]);
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  function setField(dow: number, key: keyof DowDefault, value: any) {
    setDct((prev) => ({ ...prev, [String(dow)]: { ...prev[String(dow)], [key]: value } }));
  }

  function copy(fromDow: number, toDows: number[]) {
    setDct((prev) => {
      const src = prev[String(fromDow)];
      const next = { ...prev };
      toDows.forEach((d) => { next[String(d)] = { ...src }; });
      return next;
    });
  }

  async function saveDefaults() {
    // Validate HH:MM and start<end for each day.
    for (const dow of DOW_ORDER) {
      const d = dct[String(dow)];
      if (!d) continue;
      for (const t of [d.am_start, d.am_end, d.pm_start, d.pm_end]) {
        if (t && !/^\d{1,2}:\d{2}$/.test(t)) {
          Alert.alert('Invalid time', `"${t}" on ${DOW_LABELS[dow]} — use HH:MM (24h).`);
          return;
        }
      }
    }
    Alert.alert('Save default times', 'Notify staff of the change?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save only', onPress: () => doSaveDefaults(false) },
      { text: 'Save & notify', onPress: () => doSaveDefaults(true) },
    ]);
  }

  async function doSaveDefaults(notify: boolean) {
    setSaving(true);
    setSavedMsg(null);
    const { error } = await supabase
      .from('cbd_auto_roster_rules')
      .update({ default_class_times: dct, updated_by: session.user.id })
      .eq('id', 1);
    if (error) {
      Alert.alert('Error', error.message);
      setSaving(false);
      return;
    }
    if (notify) {
      await emitNotification({
        type: 'default_class_times_changed',
        title: 'Default class times updated',
        message: 'The default class times/student numbers were changed.',
        actorId: session.user.id,
        actorName: profile?.full_name || 'A trainer',
        data: { action: 'default_class_times' },
      });
    }
    setSaving(false);
    setSavedMsg('Defaults saved.');
  }

  async function syncStudents() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const { error } = await supabase.functions.invoke('sync-vasto-students', { body: { days: 30 } });
      if (error) throw error;
      setSyncMsg('Student numbers synced for the next 30 days.');
    } catch (e: any) {
      setSyncMsg('Sync failed: ' + (e?.message || 'unknown') + ' (is the function deployed?)');
    }
    setSyncing(false);
  }

  async function addHoliday() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(phDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD, e.g. 2026-12-25.');
      return;
    }
    const { error } = await supabase
      .from('cbd_public_holidays')
      .upsert({ date: phDate, label: phLabel.trim() || 'Public holiday', created_by: session.user.id }, { onConflict: 'date' });
    if (error) { Alert.alert('Error', error.message); return; }
    setPhDate('');
    setPhLabel('');
    await load();
  }

  function removeHoliday(date: string) {
    Alert.alert('Remove holiday', `Remove ${prettyDateLong(date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('cbd_public_holidays').delete().eq('date', date);
          await load();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.surface2 }} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12), gap: spacing(3) }}>
      {/* Vasto sync */}
      <Card>
        <CardHeader title="Student Numbers (Vasto)" subtitle="Pull the latest class sizes." />
        <View style={{ padding: spacing(4) }}>
          <Btn label="Sync next 30 days" icon="↻" busy={syncing} onPress={syncStudents} />
          {syncMsg ? <Text style={{ color: palette.textMuted, marginTop: spacing(3), fontSize: 13 }}>{syncMsg}</Text> : null}
        </View>
      </Card>

      {/* Default class times */}
      <Card>
        <CardHeader title="Default Class Times" subtitle="Per weekday defaults used when there's no per-day record." />
        <View style={{ padding: spacing(4), gap: spacing(2) }}>
          <View style={styles.copyRow}>
            <Btn label="Mon→Tue–Fri" size="sm" variant="outline" onPress={() => copy(1, [2, 3, 4, 5])} />
            <Btn label="Sat→Sun" size="sm" variant="outline" onPress={() => copy(6, [0])} />
            <Btn label="Mon→all" size="sm" variant="outline" onPress={() => copy(1, [2, 3, 4, 5, 6, 0])} />
          </View>

          {DOW_ORDER.map((dow) => {
            const d = dct[String(dow)] || ({} as DowDefault);
            return (
              <View key={dow} style={[styles.dowCard, { borderColor: palette.border, backgroundColor: palette.surface2 }]}>
                <Text style={{ color: palette.textPrimary, fontWeight: '700', marginBottom: spacing(2) }}>{DOW_LABELS[dow]}</Text>
                <View style={styles.timeRow}>
                  <TimeField label="AM start" value={d.am_start} onChange={(v) => setField(dow, 'am_start', v)} palette={palette} />
                  <TimeField label="AM end" value={d.am_end} onChange={(v) => setField(dow, 'am_end', v)} palette={palette} />
                </View>
                <View style={styles.timeRow}>
                  <TimeField label="PM start" value={d.pm_start} onChange={(v) => setField(dow, 'pm_start', v)} palette={palette} />
                  <TimeField label="PM end" value={d.pm_end} onChange={(v) => setField(dow, 'pm_end', v)} palette={palette} />
                </View>
                <View style={styles.timeRow}>
                  <NumField label="Students AM" value={String(d.students_am ?? 0)} onChange={(v) => setField(dow, 'students_am', parseInt(v, 10) || 0)} palette={palette} />
                  <NumField label="Students PM" value={String(d.students_pm ?? 0)} onChange={(v) => setField(dow, 'students_pm', parseInt(v, 10) || 0)} palette={palette} />
                </View>
                <View style={styles.capRow}>
                  <View style={styles.capItem}>
                    <Text style={{ color: palette.textSecondary, fontSize: 13 }}>Cap AM</Text>
                    <Switch value={!!d.capped_am} onValueChange={(v) => setField(dow, 'capped_am', v)} trackColor={{ true: palette.primary, false: palette.border }} />
                  </View>
                  <View style={styles.capItem}>
                    <Text style={{ color: palette.textSecondary, fontSize: 13 }}>Cap PM</Text>
                    <Switch value={!!d.capped_pm} onValueChange={(v) => setField(dow, 'capped_pm', v)} trackColor={{ true: palette.primary, false: palette.border }} />
                  </View>
                </View>
              </View>
            );
          })}

          <Btn label="Save Defaults" busy={saving} onPress={saveDefaults} style={{ marginTop: spacing(2) }} />
          {savedMsg ? <Text style={{ color: palette.success, marginTop: spacing(2), fontSize: 13 }}>{savedMsg}</Text> : null}
        </View>
      </Card>

      {/* Public holidays */}
      <Card>
        <CardHeader title="Public Holidays & Closed Days" subtitle="Days with no classes." />
        <View style={{ padding: spacing(4) }}>
          <View style={styles.phAddRow}>
            <TextInput
              value={phDate}
              onChangeText={setPhDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.textMuted}
              style={[styles.input, { flex: 1, backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
            />
            <TextInput
              value={phLabel}
              onChangeText={setPhLabel}
              placeholder="Label (optional)"
              placeholderTextColor={palette.textMuted}
              style={[styles.input, { flex: 1.4, backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
            />
            <Btn label="Add" size="sm" onPress={addHoliday} />
          </View>
          {holidays.length === 0 ? (
            <Text style={{ color: palette.textMuted, marginTop: spacing(3) }}>No public holidays set.</Text>
          ) : (
            holidays.map((h) => (
              <View key={h.date} style={[styles.phRow, { borderTopColor: palette.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.textPrimary, fontWeight: '600' }}>{prettyDateLong(h.date)}</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>{h.label}</Text>
                </View>
                <Btn label="Remove" size="sm" variant="outline" onPress={() => removeHoliday(h.date)} />
              </View>
            ))
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

function TimeField({ label, value, onChange, palette }: { label: string; value: string | null; onChange: (v: string) => void; palette: any }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: palette.textMuted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value || ''}
        onChangeText={onChange}
        placeholder="HH:MM"
        placeholderTextColor={palette.textMuted}
        style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.textPrimary }]}
      />
    </View>
  );
}

function NumField({ label, value, onChange, palette }: { label: string; value: string; onChange: (v: string) => void; palette: any }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: palette.textMuted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.textPrimary }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  copyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(2) },
  dowCard: { borderWidth: 1, borderRadius: radius, padding: spacing(3) },
  timeRow: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(2) },
  capRow: { flexDirection: 'row', gap: spacing(6), marginTop: spacing(1) },
  capItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2), fontSize: 15 },
  phAddRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'flex-end' },
  phRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(3), borderTopWidth: 1, marginTop: spacing(2) },
});
