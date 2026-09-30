import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Btn } from './ui';
import { supabase } from '../lib/supabase';
import type { Profile, StaffMember } from '../lib/types';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

const SWATCHES = [
  '#2563eb', '#db2777', '#16a34a', '#f59e0b', '#8b5cf6',
  '#0891b2', '#dc2626', '#ca8a04', '#4f46e5', '#0d9488',
];

interface Props {
  visible: boolean;
  editing: StaffMember | null; // null = add
  profiles: Profile[]; // for linking
  staff: StaffMember[]; // to know which profiles are already linked
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function StaffModal({ visible, editing, profiles, staff, currentUserId, onClose, onSaved }: Props) {
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [priority, setPriority] = useState('100');
  const [isHT, setIsHT] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name || '');
      setRole(editing.role || '');
      setColor(editing.color || '#2563eb');
      setPriority(String(editing.priority ?? 100));
      setIsHT(!!editing.is_head_trainer);
      setUserId(editing.user_id || null);
    } else {
      setName(''); setRole(''); setColor('#2563eb'); setPriority('100'); setIsHT(false); setUserId(null);
    }
  }, [visible, editing]);

  // profiles available to link: unlinked, plus the one this staff already links to.
  const linkedElsewhere = new Set(staff.filter((s) => s.id !== editing?.id && s.user_id).map((s) => s.user_id));
  const linkable = profiles.filter((p) => !linkedElsewhere.has(p.id));

  async function save() {
    if (!name.trim()) { Alert.alert('Name required', 'Enter the staff member\'s name.'); return; }
    setBusy(true);
    const row: Record<string, any> = {
      name: name.trim(),
      role: role.trim() || null,
      color,
      user_id: userId,
      priority: parseInt(priority, 10) || 100,
      is_head_trainer: isHT,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from('cbd_staff_members').update(row).eq('id', editing.id));
    } else {
      row.created_by = currentUserId;
      ({ error } = await supabase.from('cbd_staff_members').insert(row));
    }
    setBusy(false);
    if (error) { Alert.alert('Error', error.message); return; }
    onSaved();
    onClose();
  }

  function remove() {
    if (!editing) return;
    Alert.alert('Remove staff', `Remove ${editing.name}? This does not delete their login account.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('cbd_staff_members').delete().eq('id', editing.id);
          if (error) { Alert.alert('Error', error.message); return; }
          onSaved();
          onClose();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: '800' }}>
              {editing ? 'Edit staff' : 'Add staff'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: palette.textMuted, fontSize: 18 }}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: spacing(8) }}>
            <Label palette={palette}>Full name *</Label>
            <Input value={name} onChangeText={setName} palette={palette} placeholder="e.g. Cameron Lee" />

            <Label palette={palette}>Role / position</Label>
            <Input value={role} onChangeText={setRole} palette={palette} placeholder="e.g. Head Trainer" />

            <Label palette={palette}>Colour</Label>
            <View style={styles.swatches}>
              {SWATCHES.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: palette.textPrimary }]} />
              ))}
            </View>

            <Label palette={palette}>Priority (lower is picked first)</Label>
            <Input value={priority} onChangeText={(t: string) => setPriority(t.replace(/[^0-9]/g, ''))} palette={palette} keyboardType="number-pad" />

            <View style={styles.switchRow}>
              <Text style={{ color: palette.textPrimary, fontWeight: '600' }}>Eligible Head Trainer</Text>
              <Switch value={isHT} onValueChange={setIsHT} trackColor={{ true: palette.primary, false: palette.border }} />
            </View>

            <Label palette={palette}>Link to login account</Label>
            <View style={styles.linkList}>
              <LinkOption label="— Not linked —" active={userId == null} onPress={() => setUserId(null)} palette={palette} />
              {linkable.map((p) => (
                <LinkOption key={p.id} label={`${p.full_name || p.id} (${p.role})`} active={userId === p.id} onPress={() => setUserId(p.id)} palette={palette} />
              ))}
            </View>

            <Btn label={editing ? 'Save changes' : 'Add staff'} busy={busy} onPress={save} style={{ marginTop: spacing(4) }} />
            {editing ? (
              <Btn label="Remove staff" variant="outline" onPress={remove} style={{ marginTop: spacing(2) }} />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Label({ children, palette }: { children: React.ReactNode; palette: any }) {
  return <Text style={{ color: palette.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing(4), marginBottom: spacing(2) }}>{children}</Text>;
}
function Input(props: any) {
  const { palette, ...rest } = props;
  return (
    <TextInput
      {...rest}
      placeholderTextColor={palette.textMuted}
      style={[styles.input, { backgroundColor: palette.surface2, borderColor: palette.border, color: palette.textPrimary }]}
    />
  );
}
function LinkOption({ label, active, onPress, palette }: { label: string; active: boolean; onPress: () => void; palette: any }) {
  return (
    <Pressable onPress={onPress} style={[styles.linkOpt, { borderColor: active ? palette.primary : palette.border, backgroundColor: active ? palette.primaryLight : palette.surface2 }]}>
      <Text style={{ color: active ? palette.primaryDark : palette.textPrimary, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), borderBottomWidth: 1 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(4) },
  linkList: { gap: spacing(2) },
  linkOpt: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(3) },
});
