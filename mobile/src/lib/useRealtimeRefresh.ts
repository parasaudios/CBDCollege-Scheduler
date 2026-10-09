import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

// Tables whose changes should refresh roster / class / staff views.
export type RealtimeTable =
  | 'cbd_day_classes'
  | 'cbd_availability'
  | 'cbd_staff_members'
  | 'cbd_assistant_availability';

const DEFAULT_TABLES: RealtimeTable[] = [
  'cbd_day_classes',
  'cbd_availability',
  'cbd_staff_members',
  'cbd_assistant_availability',
];

// Keeps an open screen live. Subscribes to Supabase Realtime for the given tables
// and calls `reload` (debounced) whenever a row changes — so when the 30-minute
// Vasto sync writes new student numbers, or a trainer edits a day on another
// device, the screen updates itself with no manual pull-to-refresh. Also reloads
// when the app returns to the foreground, because a phone's realtime socket can
// drop while the app is backgrounded and we don't want to miss changes made then.
//
// Requires the tables to be in the `supabase_realtime` publication — see
// supabase/enable-realtime-classes.sql. That is the same server-side switch the
// web app needs; running it once lights up both web and mobile.
export function useRealtimeRefresh(
  reload: () => void | Promise<void>,
  accessToken?: string,
  tables: RealtimeTable[] = DEFAULT_TABLES,
) {
  // Keep the latest reload / token in refs so month changes and hourly token
  // refreshes don't tear down and re-create the subscription.
  const reloadRef = useRef(reload);
  const tokenRef = useRef(accessToken);
  useEffect(() => {
    reloadRef.current = reload;
    tokenRef.current = accessToken;
  });

  const tablesKey = tables.join(',');

  useEffect(() => {
    const names = tablesKey ? tablesKey.split(',') : [];
    if (names.length === 0) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    // A single sync writes many rows; coalesce the burst into one reload.
    const fire = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void reloadRef.current();
      }, 400);
    };

    // RLS-protected tables need the current user's JWT on the realtime socket.
    if (tokenRef.current) {
      try {
        supabase.realtime.setAuth(tokenRef.current);
      } catch {
        /* non-fatal: supabase-js also sets this from the auth session */
      }
    }

    let channel = supabase.channel('cbd-live-' + Math.random().toString(36).slice(2));
    names.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        fire,
      );
    });
    channel.subscribe();

    // Catch up on anything missed while the app was backgrounded.
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reloadRef.current();
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      appSub.remove();
      supabase.removeChannel(channel);
    };
  }, [tablesKey]);
}
