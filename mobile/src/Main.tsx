import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import Header, { type HeaderAction } from './components/Header';
import NotificationsModal from './components/NotificationsModal';
import TopTabs, { type TabDef } from './components/TopTabs';
import UpdateBanner from './components/UpdateBanner';
import { useNotifications } from './lib/useNotifications';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import Placeholder from './screens/Placeholder';
import ScheduleScreen from './screens/ScheduleScreen';
import { useTheme } from './ThemeProvider';

type TrainerTab = 'schedule' | 'classes' | 'staff' | 'notifications' | 'admin' | 'guides';
type AssistantTab = 'myroster' | 'myavail' | 'guides';
type Tab = TrainerTab | AssistantTab;

const TRAINER_TABS: TabDef<Tab>[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'classes', label: 'Classes' },
  { key: 'staff', label: 'Staff' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'admin', label: 'Admin' },
  { key: 'guides', label: 'App Guides' },
];
const ASSISTANT_TABS: TabDef<Tab>[] = [
  { key: 'myroster', label: 'My Roster' },
  { key: 'myavail', label: 'My Availability' },
  { key: 'guides', label: 'App Guides' },
];

export default function Main({ session }: { session: Session }) {
  const { palette } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const isTrainer = profile?.role === 'trainer';
  const tabs = isTrainer ? TRAINER_TABS : ASSISTANT_TABS;
  const [tab, setTab] = useState<Tab>('schedule');
  const [notifOpen, setNotifOpen] = useState(false);

  const notif = useNotifications(session.user.id, isTrainer);

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
    return () => {
      cancelled = true;
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

  const actions: HeaderAction[] = [{ label: 'Sign out', onPress: signOut, danger: true }];
  const subtitle = isTrainer ? 'Manage team schedules' : 'Your roster & availability';

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <Header subtitle={subtitle} unread={notif.unread} onBell={() => setNotifOpen(true)} actions={actions} />
      <UpdateBanner />
      <TopTabs tabs={tabs} value={tab} onChange={setTab} />

      <View style={{ flex: 1 }}>
        {tab === 'schedule' && <ScheduleScreen session={session} profile={profile} />}
        {tab === 'classes' && <Placeholder title="Classes" />}
        {tab === 'staff' && <Placeholder title="Staff" />}
        {tab === 'notifications' && <Placeholder title="Send a notification" />}
        {tab === 'admin' && <Placeholder title="Admin" />}
        {tab === 'guides' && <Placeholder title="App Guides" />}
        {tab === 'myroster' && <Placeholder title="My Roster" />}
        {tab === 'myavail' && <Placeholder title="My Availability" />}
      </View>

      <NotificationsModal
        visible={notifOpen}
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
