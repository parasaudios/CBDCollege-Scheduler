import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

type BtnVariant = 'blue' | 'primary' | 'ghost' | 'outline' | 'success' | 'danger';

export function Btn({
  label,
  onPress,
  variant = 'blue',
  size = 'md',
  disabled,
  busy,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  busy?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  let bg = palette.primary;
  let fg = palette.onPrimary;
  let borderColor = 'transparent';
  if (variant === 'primary') {
    bg = '#ffffff';
    fg = palette.primary;
  } else if (variant === 'ghost') {
    bg = 'rgba(255,255,255,0.15)';
    fg = '#ffffff';
  } else if (variant === 'outline') {
    bg = 'transparent';
    fg = palette.textSecondary;
    borderColor = palette.borderStrong;
  } else if (variant === 'success') {
    bg = palette.success;
  } else if (variant === 'danger') {
    bg = palette.danger;
  }
  const pad =
    size === 'sm'
      ? { paddingVertical: spacing(2), paddingHorizontal: spacing(3) }
      : { paddingVertical: spacing(3), paddingHorizontal: spacing(4) };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        pad,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Text style={[styles.btnText, { color: fg, fontSize: size === 'sm' ? 13 : 15 }]}>
          {icon ? icon + '  ' : ''}
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.cardHeader, { borderBottomColor: palette.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.cardSubtitle, { color: palette.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>{children}</Text>
  );
}

type Tone = 'primary' | 'muted' | 'success' | 'danger' | 'warning';
export function Badge({ label, tone = 'primary' }: { label: string; tone?: Tone }) {
  const { palette } = useTheme();
  const map: Record<Tone, { bg: string; fg: string }> = {
    primary: { bg: palette.primaryLight, fg: palette.primaryDark },
    muted: { bg: palette.surface3, fg: palette.textMuted },
    success: { bg: palette.successLight, fg: palette.success },
    danger: { bg: palette.dangerLight, fg: palette.danger },
    warning: { bg: palette.warningLight, fg: palette.warning },
  };
  const c = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// Rounded pill sub-tabs (matches .sub-tabs in the web app).
export function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[
              styles.pill,
              {
                backgroundColor: active ? palette.primary : palette.surface,
                borderColor: active ? palette.primary : palette.border,
              },
            ]}
          >
            <Text
              style={{
                color: active ? '#fff' : palette.textSecondary,
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <Text style={{ color: palette.textMuted, fontSize: 14 }}>{children}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnText: { fontWeight: '600' },
  card: { borderRadius: radius, borderWidth: 1, overflow: 'hidden' },
  cardHeader: {
    padding: spacing(4),
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
  },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing(2),
    marginTop: spacing(4),
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
});
