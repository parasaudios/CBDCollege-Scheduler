import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import Header, { type HeaderAction } from './components/Header';
import NotificationsModal from './components/NotificationsModal';
import TopTabs, { type TabDef } from './components/TopTabs';
import UpdateBanner from './components/UpdateBanner';
import { exportMonthPdf } from './lib/exportPdf';
import { onNotificationTap, registerForPush, sendTestNotification } from './lib/push';
import { useNotifications } from './lib/useNotifications';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import AdminScreen from './screens/AdminScreen';
import ClassesScreen from './screens/ClassesScreen';
import GuidesScreen from './screens/GuidesScreen';
import MyAvailabilityScreen from './screens/MyAvailabilityScreen';
import MyRosterScreen from './screens/MyRosterScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import StaffScreen from './screens/StaffScreen';
import { useTheme } from './ThemeProvider';

type TrainerTab = 'schedule' | 'classes' | 'staff' | 'notifications' | 'admin' | 'guides';
type AssistantTab = 'myroster' | 'myavail' | 'guides';
type Tab = TrainerTab | AssistantTab;

// Keep the tab bar to a few top-level sections so it never overflows the screen;
// less-frequent trainer tools (announcements, user accounts, guides) live in the
// header ⋯ menu instead.
const TRAINER_TABS: TabDef<Tab>[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'classes', label: 'Classes' },
  { key: 'staff', label: 'Staff' },
];
const ASSISTANT_TABS: TabDef<Tab>[] = [
  { key: 'myroster', label: 'My Roster' },
  { key: 'myavail', label: 'My Availability' },
];

export default function Main({ session }: { session: Session }) {
  const { palette } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const isTrainer = profile?.role === 'trainer';
  const tabs = isTrainer ? TRAINER_TABS : ASSISTANT_TABS;
  const [tab, setTab] = useState<Tab>('schedule');
  const [notifOpen, setNotifOpen] = useState(false);

  const notif = useNotifications(session.user.id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('cbd_profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled) {
        const p = (data as Profile) || null;
        setProfile(p);
        setTab(p?.role === 'trainer' ? 'schedule' : 'myroster');
        setLoading(false);
      }
    })();
    // Register for native push (best-effort) and open the bell when a push is tapped.
    registerForPush(session.user.id);
    const unsub = onNotificationTap(() => setNotifOpen(true));
    return () => {
      cancelled = true;
      unsub();
    };
  }, [session.user.id]);

  function signOut() {
    Alert.alert('Sign out', 'Sign out of the scheduler?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  async function exportPdf() {
    const d = new Date();
    try {
      await exportMonthPdf(d.getFullYear(), d.getMonth(), 'CBD College Scheduler');
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not create the PDF.');
    }
  }

  async function testNotif() {
    const res = await sendTestNotification();
    if (res === 'denied') {
      Alert.alert(
        'Notifications are off',
        'Turn on notifications for this app in your phone settings, then try again.',
      );
    } else {
      Alert.alert('Test sent', 'Check your notification shade — a test notification should appear now.');
    }
  }

  // Overflow destinations that aren't top-level tabs, routed via the header menu.
  const navActions: HeaderAction[] = isTrainer
    ? [
        { label: '📣  Send announcement', onPress: () => setTab('notifications') },
        { label: '👥  User accounts', onPress: () => setTab('admin') },
        { label: '📖  App guides', onPress: () => setTab('guides') },
      ]
    : [{ label: '📖  App guides', onPress: () => setTab('guides') }];

  const actions: HeaderAction[] = [
    ...navActions,
    { label: '🔔  Send test notification', onPress: testNotif },
    { label: '📄  Export PDF (this month)', onPress: exportPdf },
    { label: 'Sign out', onPress: signOut, danger: true },
  ];
  const overflowTitle: Partial<Record<Tab, string>> = {
    notifications: 'Send announcement',
    admin: 'User accounts',
    guides: 'App guides',
  };
  const subtitle = overflowTitle[tab] || (isTrainer ? 'Manage team schedules' : 'Your roster & availability');

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <Header subtitle={subtitle} unread={notif.unread} onBell={() => setNotifOpen(true)} actions={actions} />
      <UpdateBanner />
      <TopTabs tabs={tabs} value={tab} onChange={setTab} />

      <View style={{ flex: 1 }}>
        {tab === 'schedule' && <ScheduleScreen session={session} profile={profile} />}
        {tab === 'classes' && <ClassesScreen session={session} profile={profile} />}
        {tab === 'staff' && <StaffScreen session={session} profile={profile} />}
        {tab === 'notifications' && <NotificationsScreen session={session} profile={profile} />}
        {tab === 'admin' && <AdminScreen session={session} profile={profile} />}
        {tab === 'guides' && <GuidesScreen profile={profile} />}
        {tab === 'myroster' && <MyRosterScreen session={session} profile={profile} />}
        {tab === 'myavail' && <MyAvailabilityScreen session={session} profile={profile} />}
      </View>

      <NotificationsModal
        visible={notifOpen}
        currentUserId={session.user.id}
        onClose={() => setNotifOpen(false)}
        notifications={notif.notifications}
        reads={notif.reads}
        markRead={notif.markRead}
        markAllRead={notif.markAllRead}
        onGotoDate={() => setTab(isTrainer ? 'schedule' : 'myroster')}
      />
    </View>
  );
}
