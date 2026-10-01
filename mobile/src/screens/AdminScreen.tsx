import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Badge, Btn, Card, CardHeader } from '../components/ui';
import {
  createUser,
  deleteUser,
  emailFromInput,
  generatePassword,
  listUsers,
  setUserEmail,
  setUserPassword,
  setUserRole,
  type AdminUser,
} from '../lib/admin';
import type { Profile } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { spacing } from '../theme';

export default function AdminScreen({ session }: { session: Session; profile: Profile | null }) {
  const { palette } = useTheme();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [emailUser, setEmailUser] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      setUsers(await listUsers());
    } catch (e: any) {
      setErr(e?.message || 'Could not load users.');
    }
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  function toggleRole(u: AdminUser) {
    const next = u.role === 'trainer' ? 'assistant' : 'trainer';
    Alert.alert('Change role', `Make ${u.full_name} a ${next}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          try { await setUserRole(u.user_id, next); await load(); }
          catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); }
        },
      },
    ]);
  }

  function removeUser(u: AdminUser) {
    Alert.alert('Delete user', `Permanently delete ${u.full_name}'s account? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await deleteUser(u.user_id); await load(); }
          catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); }
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
    <ScrollView style={{ flex: 1, backgroundColor: palette.surface2 }} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(12) }}>
      <Card>
        <CardHeader title="User Accounts" subtitle={`${users.length} accounts`} right={<Btn label="+ Create" size="sm" onPress={() => setCreateOpen(true)} />} />
        <View style={{ padding: spacing(3) }}>
          {err ? <Text style={{ color: palette.danger, marginBottom: spacing(2) }}>{err}</Text> : null}
          {users.map((u) => {
            const self = u.user_id === session.user.id;
            return (
              <View key={u.user_id} style={[styles.row, { borderBottomColor: palette.border }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), flexWrap: 'wrap' }}>
                    <Text style={{ color: palette.textPrimary, fontWeight: '700', fontSize: 15 }}>{u.full_name}</Text>
                    <Badge label={u.role || 'assistant'} tone={u.role === 'trainer' ? 'primary' : 'muted'} />
                    {self ? <Badge label="You" tone="success" /> : null}
                  </View>
                  <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}>{u.email}</Text>
                  <View style={styles.actions}>
                    <Btn label="Password" size="sm" variant="outline" onPress={() => setPwUser(u)} />
                    <Btn label="Email" size="sm" variant="outline" onPress={() => setEmailUser(u)} />
                    {!self ? (
                      <>
                        <Btn label={u.role === 'trainer' ? 'Make Assistant' : 'Make Trainer'} size="sm" variant="outline" onPress={() => toggleRole(u)} />
                        <Btn label="Delete" size="sm" variant="outline" onPress={() => removeUser(u)} />
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <CreateUserModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        createdBy={session.user.id}
        onCreated={load}
      />
      <PromptModal
        visible={pwUser != null}
        title={`Set password — ${pwUser?.full_name || ''}`}
        placeholder="New password (min 6)"
        initial=""
        showGenerate
        secure
        onClose={() => setPwUser(null)}
        onSubmit={async (val) => {
          if (val.length < 6) { Alert.alert('Too short', 'Password must be at least 6 characters.'); return false; }
          try { await setUserPassword(pwUser!.user_id, val); Alert.alert('Done', 'Password updated.'); return true; }
          catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); return false; }
        }}
      />
      <PromptModal
        visible={emailUser != null}
        title={`Change email — ${emailUser?.full_name || ''}`}
        placeholder="username or email"
        initial=""
        transform={emailFromInput}
        onClose={() => setEmailUser(null)}
        onSubmit={async (val) => {
          const email = emailFromInput(val);
          if (!email) { Alert.alert('Required', 'Enter a username or email.'); return false; }
          try { await setUserEmail(emailUser!.user_id, email); await load(); Alert.alert('Done', 'Email updated.'); return true; }
          catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); return false; }
        }}
      />
    </ScrollView>
  );
}

function CreateUserModal({ visible, onClose, createdBy, onCreated }: { visible: boolean; onClose: () => void; createdBy: string; onCreated: () => void }) {
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('assistant');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setName(''); setEmail(''); setPassword(''); setRole('assistant'); } }, [visible]);

  async function submit() {
    if (!name.trim() || !email.trim() || password.length < 6) {
      Alert.alert('Check fields', 'Name, username/email and a 6+ character password are required.');
      return;
    }
    setBusy(true);
    try {
      await createUser(name.trim(), emailFromInput(email), password, role, createdBy);
      setBusy(false);
      onCreated();
      onClose();
      Alert.alert('Created', `${name.trim()} can now sign in.`);
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Error', e?.message || 'Failed to create user.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={[styles.mHeader, { borderBottomColor: palette.border }]}>
            <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: '800' }}>Create user</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: palette.textMuted, fontSize: 18 }}>✕</Text></Pressable>
          </View>
          <View style={{ padding: spacing(4), gap: spacing(3) }}>
            <Field palette={palette} value={name} onChangeText={setName} placeholder="Full name" />
            <Field palette={palette} value={email} onChangeText={setEmail} placeholder="Username or email" autoCapitalize="none" />
            <Field palette={palette} value={password} onChangeText={setPassword} placeholder="Password (min 6)" />
            <View style={{ flexDirection: 'row', gap: spacing(2) }}>
              {['assistant', 'trainer'].map((r) => (
                <Pressable key={r} onPress={() => setRole(r)} style={[styles.roleOpt, { borderColor: role === r ? palette.primary : palette.border, backgroundColor: role === r ? palette.primaryLight : palette.surface2 }]}>
                  <Text style={{ color: role === r ? palette.primaryDark : palette.textPrimary, textTransform: 'capitalize' }}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <Btn label="Create User" busy={busy} onPress={submit} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PromptModal({
  visible, title, placeholder, initial, secure, showGenerate, transform, onClose, onSubmit,
}: {
  visible: boolean; title: string; placeholder: string; initial: string; secure?: boolean; showGenerate?: boolean;
  transform?: (v: string) => string; onClose: () => void; onSubmit: (val: string) => Promise<boolean>;
}) {
  const { palette } = useTheme();
  const [val, setVal] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setVal(initial); }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { justifyContent: 'center', padding: spacing(5) }]}>
        <View style={[styles.promptCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: spacing(3) }}>{title}</Text>
          <Field palette={palette} value={val} onChangeText={setVal} placeholder={placeholder} secureTextEntry={secure} autoCapitalize="none" />
          {transform && val ? <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 4 }}>→ {transform(val)}</Text> : null}
          {showGenerate ? (
            <Btn label="Generate strong password" size="sm" variant="outline" onPress={() => setVal(generatePassword())} style={{ marginTop: spacing(2) }} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(4), justifyContent: 'flex-end' }}>
            <Btn label="Cancel" size="sm" variant="outline" onPress={onClose} />
            <Btn label="Save" size="sm" busy={busy} onPress={async () => { setBusy(true); const ok = await onSubmit(val); setBusy(false); if (ok) onClose(); }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field(props: any) {
  const { palette, ...rest } = props;
  return (
    <TextInput
      {...rest}
      placeholderTextColor={palette.textMuted}
      style={[styles.input, { backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing(3), borderBottomWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginTop: spacing(3) },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, maxHeight: '90%' },
  mHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), borderBottomWidth: 1 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15 },
  roleOpt: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: spacing(3), alignItems: 'center' },
  promptCard: { borderWidth: 1, borderRadius: 14, padding: spacing(4) },
});
