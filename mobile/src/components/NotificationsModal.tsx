import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { prettyDateLong, prettyTime, timeAgo } from '../lib/format';
import { notifTypeMeta } from '../lib/notifMeta';
import { supabase } from '../lib/supabase';
import type { NotificationRow } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  notifications: NotificationRow[];
  reads: Record<string, boolean>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  onGotoDate?: (date: string) => void;
}

export default function NotificationsModal({
  visible,
  onClose,
  notifications,
  reads,
  markRead,
  markAllRead,
  onGotoDate,
}: Props) {
  const { palette } = useTheme();
  const [detail, setDetail] = useState<NotificationRow | null>(null);

  useEffect(() => {
    if (!visible) setDetail(null);
  }, [visible]);

  function openDetail(n: NotificationRow) {
    if (!reads[n.id]) markRead(n.id);
    setDetail(n);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            {detail ? (
              <Pressable onPress={() => setDetail(null)} hitSlop={8}>
                <Text style={{ color: palette.primary, fontSize: 15, fontWeight: '600' }}>‹ Back</Text>
              </Pressable>
            ) : (
              <Text style={[styles.title, { color: palette.textPrimary }]}>Notifications</Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
              {!detail ? (
                <Pressable onPress={markAllRead} hitSlop={6}>
                  <Text style={{ color: palette.primary, fontSize: 13, fontWeight: '600' }}>
                    Mark all read
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={{ color: palette.textMuted, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
          </View>

          {detail ? (
            <Detail n={detail} onGotoDate={onGotoDate} onClose={onClose} />
          ) : notifications.length === 0 ? (
            <View style={{ padding: spacing(8), alignItems: 'center' }}>
              <Text style={{ color: palette.textMuted }}>No notifications yet.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: spacing(6) }}>
              {notifications.map((n) => {
                const meta = notifTypeMeta(n.type);
                const unread = !reads[n.id];
                const subject = n.data?.subject_name;
                const actor = n.data?.actor_name;
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => openDetail(n)}
                    style={[styles.item, { borderBottomColor: palette.border }]}
                  >
                    <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.itemTop}>
                        <Text style={{ color: meta.accent(palette), fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                          {meta.label}
                        </Text>
                        <Text style={{ color: palette.textMuted, fontSize: 11 }}>{timeAgo(n.created_at)}</Text>
                      </View>
                      <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 14, marginTop: 2 }}>
                        {n.title}
                      </Text>
                      {n.message ? (
                        <Text numberOfLines={2} style={{ color: palette.textSecondary, fontSize: 13, marginTop: 2 }}>
                          {n.message}
                        </Text>
                      ) : null}
                      {subject || actor ? (
                        <Text style={{ color: palette.textMuted, fontSize: 11, marginTop: 3 }}>
                          {subject ? `Affects ${subject}` : ''}
                          {subject && actor ? ' · ' : ''}
                          {actor ? `by ${actor}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    {unread ? <View style={[styles.unreadDot, { backgroundColor: palette.primary }]} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Detail({
  n,
  onGotoDate,
  onClose,
}: {
  n: NotificationRow;
  onGotoDate?: (date: string) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const meta = notifTypeMeta(n.type);
  const date: string | undefined = n.data?.date;
  const [snapshot, setSnapshot] = useState<
    { name: string; color: string | null; day_role: string | null; status: string; start_time: string | null; end_time: string | null; is_head_trainer: boolean }[] | null
  >(null);
  const [snapLoading, setSnapLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    setSnapLoading(true);
    (async () => {
      const [aRes, sRes] = await Promise.all([
        supabase.from('cbd_availability').select('*').eq('date', date).in('status', ['available', 'partial']),
        supabase.from('cbd_staff_members').select('*'),
      ]);
      const staff = (sRes.data || []) as any[];
      const byId: Record<string, any> = {};
      staff.forEach((s) => (byId[s.id] = s));
      const rows = ((aRes.data || []) as any[]).map((a) => {
        const s = byId[a.staff_id];
        return {
          name: s?.name || 'Unknown',
          color: s?.color || null,
          day_role: a.day_role,
          status: a.status,
          start_time: a.start_time,
          end_time: a.end_time,
          is_head_trainer: !!s?.is_head_trainer,
        };
      });
      rows.sort((x, y) => (x.is_head_trainer === y.is_head_trainer ? 0 : x.is_head_trainer ? -1 : 1));
      setSnapshot(rows);
      setSnapLoading(false);
    })();
  }, [date]);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: spacing(8) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
        <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
        <Text style={{ color: meta.accent(palette), fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
          {meta.label}
        </Text>
      </View>
      <Text style={{ color: palette.textPrimary, fontSize: 18, fontWeight: '800', marginTop: spacing(2) }}>
        {n.title}
      </Text>
      {n.message ? (
        <Text style={{ color: palette.textSecondary, fontSize: 15, marginTop: spacing(2) }}>{n.message}</Text>
      ) : null}

      <View style={{ marginTop: spacing(4) }}>
        <Row label="When" value={`${prettyDateLong(n.created_at.slice(0, 10))} · ${timeAgo(n.created_at)}`} />
        {n.data?.subject_name ? <Row label="Affects" value={n.data.subject_name} /> : null}
        {n.data?.actor_name ? <Row label="Changed by" value={n.data.actor_name} /> : null}
        {date ? <Row label="Date" value={prettyDateLong(date)} /> : null}
      </View>

      {date ? (
        <View style={{ marginTop: spacing(4) }}>
          <Text style={[styles.snapTitle, { color: palette.textSecondary }]}>Rostered on {prettyDateLong(date)}</Text>
          {snapLoading ? (
            <ActivityIndicator color={palette.primary} style={{ marginTop: spacing(3) }} />
          ) : !snapshot || snapshot.length === 0 ? (
            <Text style={{ color: palette.textMuted, marginTop: spacing(2) }}>No one rostered.</Text>
          ) : (
            snapshot.map((r, i) => (
              <View key={i} style={styles.snapRow}>
                <View style={[styles.dot, { backgroundColor: r.color || palette.primary }]} />
                <Text style={{ color: palette.textPrimary, fontWeight: '600', flex: 1 }}>{r.name}</Text>
                <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                  {r.is_head_trainer ? 'Head Trainer' : r.status === 'partial' ? 'Partial' : 'Assistant'}
                  {r.start_time ? ` · ${prettyTime(r.start_time)}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {date && onGotoDate ? (
        <Pressable
          onPress={() => {
            onGotoDate(date);
            onClose();
          }}
          style={[styles.gotoBtn, { backgroundColor: palette.primary }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Go to this day</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.factRow}>
      <Text style={{ color: palette.textMuted, fontSize: 13, width: 96 }}>{label}</Text>
      <Text style={{ color: palette.textPrimary, fontSize: 14, flex: 1 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, maxHeight: '90%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing(4),
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: '800' },
  item: { flexDirection: 'row', gap: spacing(3), padding: spacing(4), borderBottomWidth: 1, alignItems: 'flex-start' },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  factRow: { flexDirection: 'row', paddingVertical: spacing(1) },
  snapTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  snapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  gotoBtn: { marginTop: spacing(5), borderRadius: radius, paddingVertical: spacing(3), alignItems: 'center' },
});
