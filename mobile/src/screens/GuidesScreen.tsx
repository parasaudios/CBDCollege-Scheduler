import { ScrollView, Text, View } from 'react-native';
import { Card, CardHeader } from '../components/ui';
import type { Profile } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { spacing } from '../theme';

interface Section { title: string; body: string[] }

const COMMON: Section[] = [
  { title: 'Signing in', body: ['Enter your name (or full email) and password — the same login as the web scheduler.', 'Your session is remembered, so you stay signed in.'] },
  { title: 'Day colours', body: ['Green = you (or the person selected) are rostered.', 'Red = a class runs but you are not needed.', 'PH (purple) = public holiday, no classes.'] },
  { title: 'Dark mode', body: ['Tap the ☾/☀ icon in the top bar to switch between light and dark. Your choice is saved.'] },
  { title: 'Notifications', body: ['The 🔔 bell shows a red count of unread notifications.', 'Tap it to see the list, then tap a notification for full details including who is rostered that day.'] },
  { title: 'Updates', body: ['When a new version is published you will see an "Update available" banner — tap Update to download the latest APK.'] },
];

const ASSISTANT: Section[] = [
  { title: 'My Roster', body: ['See the days you are rostered and your next shift at a glance.', 'Tap any day to see the full roster and class details.'] },
  { title: 'My Availability', body: ['Set your normal weekly pattern (which weekdays you can work).', 'Use the calendar to mark one-off days available or not available.', 'You cannot mark yourself unavailable within 14 days of a date — ask a trainer for shorter notice.'] },
];

const TRAINER: Section[] = [
  { title: 'Schedule', body: ['The Roster view shows the whole team\'s calendar; Team overview lists each class day with who is on.', 'Tap a day to view or edit its class numbers and roster.', 'Use "Sync students" to pull the latest class sizes from Vasto.'] },
  { title: 'Classes', body: ['Set the default class times and student numbers per weekday.', 'Add public holidays so no one is rostered on closed days.'] },
  { title: 'Staff', body: ['Add, edit or remove staff and link them to a login account.', 'Set who is a head trainer, priority order, and the assistant thresholds.', 'Under Availability, manage weekly patterns and one-off overrides for any assistant.'] },
  { title: 'Notifications & Admin', body: ['Send announcements to one person or the whole team from the Notifications tab.', 'Create and manage login accounts, passwords and roles from the Admin tab.'] },
];

export default function GuidesScreen({ profile }: { profile: Profile | null }) {
  const { palette } = useTheme();
  const isTrainer = profile?.role === 'trainer';
  const sections = [...(isTrainer ? TRAINER : ASSISTANT), ...COMMON];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.surface2 }} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12), gap: spacing(3) }}>
      <Card>
        <CardHeader title="App Guide" subtitle={isTrainer ? 'For trainers' : 'For assistants'} />
      </Card>
      {sections.map((s) => (
        <Card key={s.title}>
          <View style={{ padding: spacing(4) }}>
            <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: spacing(2) }}>{s.title}</Text>
            {s.body.map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', marginTop: i > 0 ? spacing(2) : 0 }}>
                <Text style={{ color: palette.primary, marginRight: spacing(2) }}>•</Text>
                <Text style={{ color: palette.textSecondary, fontSize: 14, flex: 1, lineHeight: 20 }}>{line}</Text>
              </View>
            ))}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
