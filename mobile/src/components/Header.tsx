import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../ThemeProvider';
import { appVersionLabel } from '../lib/version';
import { radius, spacing } from '../theme';

const HEADER_BG = '#2563eb'; // brand blue, same in light & dark (matches web header)

export interface HeaderAction {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export default function Header({
  subtitle,
  unread,
  onBell,
  actions,
}: {
  subtitle: string;
  unread: number;
  onBell: () => void;
  actions: HeaderAction[];
}) {
  const { effective, toggle } = useTheme();
  const [menu, setMenu] = useState(false);

  return (
    <View style={[styles.bar, { backgroundColor: HEADER_BG }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          CBD College Staff Scheduler
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.actions}>
        <IconBtn onPress={onBell}>
          <Text style={styles.icon}>🔔</Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </IconBtn>
        <IconBtn onPress={toggle}>
          <Text style={styles.icon}>{effective === 'dark' ? '☀' : '☾'}</Text>
        </IconBtn>
        {actions.length > 0 ? (
          <IconBtn onPress={() => setMenu(true)}>
            <Text style={styles.icon}>⋯</Text>
          </IconBtn>
        ) : null}
      </View>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenu(false)}>
          <MenuSheet actions={actions} onClose={() => setMenu(false)} />
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuSheet({
  actions,
  onClose,
}: {
  actions: HeaderAction[];
  onClose: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.menu,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      {actions.map((a, i) => (
        <Pressable
          key={a.label}
          onPress={() => {
            onClose();
            a.onPress();
          }}
          style={[
            styles.menuItem,
            i > 0 && { borderTopWidth: 1, borderTopColor: palette.border },
          ]}
        >
          <Text
            style={{
              color: a.danger ? palette.danger : palette.textPrimary,
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
      <View style={[styles.menuFooter, { borderTopColor: palette.border }]}>
        <Text style={{ color: palette.textMuted, fontSize: 12 }}>{appVersionLabel()}</Text>
      </View>
    </View>
  );
}

function IconBtn({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing(12),
    paddingBottom: spacing(3),
    paddingHorizontal: spacing(4),
    gap: spacing(2),
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { color: '#fff', fontSize: 17 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingTop: spacing(20),
    paddingRight: spacing(3),
    alignItems: 'flex-end',
  },
  menu: {
    minWidth: 200,
    borderRadius: radius,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: { paddingVertical: spacing(3), paddingHorizontal: spacing(4) },
  menuFooter: { paddingVertical: spacing(2), paddingHorizontal: spacing(4), borderTopWidth: 1 },
});
