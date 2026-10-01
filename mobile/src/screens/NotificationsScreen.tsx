import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Btn, Card, CardHeader } from '../components/ui';
import { emitNotification } from '../lib/notify';
import { supabase } from '../lib/supabase';
import type { Profile, StaffMember } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { spacing } from '../theme';

// Trainer "Notifications" tab: compose and send a notification (manual_announcement).
export default function NotificationsScreen({ session, profile }: { session: Session; profile: Profile | null }) {
  const { palette } = useTheme();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [recipient, setRecipient] = useState<string | null>(null); // null = broadcast
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('cbd_staff_members').select('*').not('user_id', 'is', null).order('name');
      setStaff((data || []) as StaffMember[]);
    })();
  }, []);

  function send() {
    if (!title.trim() || !message.trim()) { Alert.alert('Missing text', 'Enter a title and a message.'); return; }
    const who = recipient ? staff.find((s) => s.user_id === recipient)?.name || 'that person' : 'everyone';
    Alert.alert('Send notification', `Send "${title.trim()}" to ${who}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: doSend },
    ]);
  }

  async function doSend() {
    setBusy(true);
    setSentMsg(null);
    await emitNotification({
      type: 'manual_announcement',
      title: title.trim(),
      message: message.trim(),
      target_user_id: recipient || undefined,
      actorId: session.user.id,
      actorName: profile?.full_name || 'A trainer',
    });
    setBusy(false);
    setTitle('');
    setMessage('');
    setSentMsg('Notification sent.');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.surface2 }} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12) }}>
      <Card>
        <CardHeader title="Send a notification" subtitle="Message a staff member or the whole team." />
        <View style={{ padding: spacing(4) }}>
          <Text style={labelStyle(palette)}>Recipient</Text>
          <View style={{ gap: spacing(2) }}>
            <Opt label="All staff (broadcast)" active={recipient === null} onPress={() => setRecipient(null)} palette={palette} />
            {staff.map((s) => (
              <Opt key={s.id} label={s.name} active={recipient === s.user_id} onPress={() => setRecipient(s.user_id!)} palette={palette} />
            ))}
          </View>

          <Text style={labelStyle(palette)}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder="Short headline"
            placeholderTextColor={palette.textMuted}
            style={[styles.input, { backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
          />

          <Text style={labelStyle(palette)}>Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            maxLength={400}
            multiline
            placeholder="What do they need to know?"
            placeholderTextColor={palette.textMuted}
            style={[styles.input, { minHeight: 110, textAlignVertical: 'top', backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
          />

          <Btn label="Send Notification" busy={busy} onPress={send} style={{ marginTop: spacing(4) }} />
          {sentMsg ? <Text style={{ color: palette.success, marginTop: spacing(3), fontSize: 13 }}>{sentMsg}</Text> : null}
        </View>
      </Card>
    </ScrollView>
  );
}

function Opt({ label, active, onPress, palette }: { label: string; active: boolean; onPress: () => void; palette: any }) {
  return (
    <Pressable onPress={onPress} style={[styles.opt, { borderColor: active ? palette.primary : palette.border, backgroundColor: active ? palette.primaryLight : palette.surface2 }]}>
      <Text style={{ color: active ? palette.primaryDark : palette.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

function labelStyle(palette: any) {
  return { color: palette.textSecondary, fontSize: 13, fontWeight: '600' as const, marginTop: spacing(4), marginBottom: spacing(2) };
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15 },
  opt: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(3) },
});
