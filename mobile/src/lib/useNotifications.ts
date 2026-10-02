import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAppBadge } from './push';
import { supabase } from './supabase';
import type { NotificationRow } from './types';

// Loads notifications + read receipts, exposes unread count and mark-read helpers.
// Everyone sees only what's addressed to them — notifications targeted at them,
// plus broadcasts (target_user_id NULL). Changes are fanned out per-recipient
// (see notify.ts), so this is how each person sees only changes that affect them
// (Cameron is targeted on every change, so he still sees everything).
// Polls every 15s while the app is foregrounded (matches the web app).
export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [reads, setReads] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const q = supabase
      .from('cbd_notifications')
      .select('*')
      .or(`target_user_id.eq.${userId},target_user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(50);
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
  }, [userId]);

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

  // Mirror the unread count onto the home-screen app-icon badge.
  useEffect(() => {
    setAppBadge(unread);
  }, [unread]);

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
