import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import type { NotificationRow } from './types';

// Loads notifications + read receipts, exposes unread count and mark-read helpers.
// Trainers see all rows; assistants see only their own (client filter mirrors RLS).
// Polls every 15s while the app is foregrounded (matches the web app).
export function useNotifications(userId: string, isTrainer: boolean) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [reads, setReads] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    let q = supabase
      .from('cbd_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!isTrainer) q = q.eq('target_user_id', userId);
    const [nRes, rRes] = await Promise.all([
      q,
      supabase.from('cbd_notification_reads').select('notification_id').eq('user_id', userId),
    ]);
    setNotifications((nRes.data || []) as NotificationRow[]);
    const map: Record<string, boolean> = {};
    ((rRes.data || []) as { notification_id: string }[]).forEach((r) => {
      map[r.notification_id] = true;
    });
    setReads(map);
  }, [userId, isTrainer]);

  useEffect(() => {
    load();
    function start() {
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        if (AppState.currentState === 'active') load();
      }, 15000);
    }
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      sub.remove();
    };
  }, [load]);

  const unread = notifications.filter((n) => !reads[n.id]).length;

  const markRead = useCallback(
    async (id: string) => {
      setReads((prev) => ({ ...prev, [id]: true }));
      await supabase
        .from('cbd_notification_reads')
        .upsert({ notification_id: id, user_id: userId }, { onConflict: 'notification_id,user_id' });
    },
    [userId],
  );

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !reads[n.id]).map((n) => n.id);
    if (!unreadIds.length) return;
    setReads((prev) => {
      const next = { ...prev };
      unreadIds.forEach((id) => (next[id] = true));
      return next;
    });
    await supabase
      .from('cbd_notification_reads')
      .upsert(
        unreadIds.map((id) => ({ notification_id: id, user_id: userId })),
        { onConflict: 'notification_id,user_id' },
      );
  }, [notifications, reads, userId]);

  return { notifications, reads, unread, load, markRead, markAllRead };
}
