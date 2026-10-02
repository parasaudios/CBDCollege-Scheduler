import type { Session } from '@supabase/supabase-js';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Btn } from './ui';
import { buildMonthGrid, monthLabel, prettyDateShortDow } from '../lib/format';
import { notifyChange } from '../lib/notify';
import { makeRoster, type ComputedEntry, type RosterContext } from '../lib/rosterCompute';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

// Regenerate a whole month's roster from the auto-roster rules. Ignores existing
// explicit entries (computes from the rules + weekend rotation), then replaces the
// month's cbd_availability with the result.
export default function AutoRosterModal({
  visible, ctx, year, month0, session, profile, onClose, onApplied,
}: {
  visible: boolean; ctx: RosterContext; year: number; month0: number; session: Session; profile: Profile | null;
  onClose: () => void; onApplied: () => void;
}) {
  const { palette } = useTheme();
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Engine with explicit availability stripped → pure computed roster + weekend rule.
  const computed = useMemo(() => {
    const e = makeRoster({ ...ctx, availabilityByStaff: {} });
    const grid = buildMonthGrid(year, month0).filter((d): d is string => !!d);
    return grid
      .map((d) => ({ date: d, entries: e.getRosterForDate(d) }))
      .filter((x) => x.entries.length > 0);
  }, [ctx, year, month0]);

  const totalSlots = computed.reduce((n, d) => n + d.entries.length, 0);

  function confirmApply() {
    Alert.alert(
      'Apply auto-roster',
      `Replace ${monthLabel(year, month0)}'s roster with ${totalSlots} generated shift${totalSlots === 1 ? '' : 's'} across ${computed.length} day${computed.length === 1 ? '' : 's'}? This overwrites existing entries for those days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply', onPress: apply },
      ],
    );
  }

  async function apply() {
    setApplying(true);
    setMsg(null);
    try {
      const affected = new Set<string>();
      for (const day of computed) {
        // Replace the day: delete existing, insert computed.
        const del = await supabase.from('cbd_availability').delete().eq('date', day.date);
        if (del.error) throw del.error;
        const rows = day.entries.map((e: ComputedEntry) => ({
          staff_id: e.staff_id,
          date: day.date,
          status: 'available',
          day_role: e.day_role,
          start_time: e.start_time,
          end_time: e.end_time,
        }));
        if (rows.length) {
          const ins = await supabase.from('cbd_availability').upsert(rows, { onConflict: 'staff_id,date' });
          if (ins.error) throw ins.error;
        }
        day.entries.forEach((e) => {
          const st = ctx.staff.find((s) => s.id === e.staff_id);
          if (st?.user_id) affected.add(st.user_id);
        });
      }
      // One notification per affected person (they get "Your roster was updated";
      // Cameron is always copied via notifyChange).
      const actorName = profile?.full_name || 'A trainer';
      await Promise.all(
        Array.from(affected).map((uid) => {
          const st = ctx.staff.find((s) => s.user_id === uid);
          return notifyChange({
            type: 'roster_changed',
            actorId: session.user.id,
            actorName,
            subjectUserId: uid,
            subjectName: st?.name || '',
            affectedUserIds: [uid],
            selfTitle: 'Your roster was updated',
            title: `${st?.name || 'Someone'}'s roster was updated`,
            message: `${monthLabel(year, month0)} roster was auto-generated.`,
            data: { action: 'auto_roster' },
          });
        }),
      );
      setMsg(`Applied — ${totalSlots} shifts across ${computed.length} days.`);
      onApplied();
    } catch (e: any) {
      setMsg('Error: ' + (e?.message || 'apply failed'));
    }
    setApplying(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: '800' }}>Auto-roster — {monthLabel(year, month0)}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: palette.textMuted, fontSize: 18 }}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: spacing(8) }}>
            <Text style={{ color: palette.textSecondary, fontSize: 13, marginBottom: spacing(3) }}>
              Preview generated from your rules (head-trainer rotation, assistant thresholds, availability). Applying replaces this month's roster.
            </Text>
            {computed.length === 0 ? (
              <Text style={{ color: palette.textMuted }}>No class days to roster this month.</Text>
            ) : (
              computed.map((day) => (
                <View key={day.date} style={[styles.row, { borderBottomColor: palette.border }]}>
                  <Text style={{ color: palette.textPrimary, fontWeight: '600', width: 92, fontSize: 13 }}>{prettyDateShortDow(day.date)}</Text>
                  <Text style={{ color: palette.textSecondary, flex: 1, fontSize: 13 }}>
                    {day.entries.map((e) => e.name.split(' ')[0] + (e.is_head_trainer ? ' (HT)' : '')).join(', ')}
                  </Text>
                </View>
              ))
            )}
            {msg ? <Text style={{ color: msg.startsWith('Error') ? palette.danger : palette.success, marginTop: spacing(3) }}>{msg}</Text> : null}
            <Btn label={`Apply to ${monthLabel(year, month0)}`} busy={applying} disabled={computed.length === 0} onPress={confirmApply} style={{ marginTop: spacing(4) }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, maxHeight: '88%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), paddingVertical: spacing(2), borderBottomWidth: 1 },
});
