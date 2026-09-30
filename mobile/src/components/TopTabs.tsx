import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { spacing } from '../theme';

export interface TabDef<T extends string> {
  key: T;
  label: string;
}

// Horizontal pill tab bar matching the web app's .tabs container.
export default function TopTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (k: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ backgroundColor: palette.surface2 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={[styles.container, { backgroundColor: palette.surface3 }]}>
          {tabs.map((t) => {
            const active = t.key === value;
            return (
              <Pressable
                key={t.key}
                onPress={() => onChange(t.key)}
                style={[
                  styles.tab,
                  active && {
                    backgroundColor: palette.surface,
                    shadowColor: '#000',
                    shadowOpacity: 0.12,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? palette.primary : palette.textSecondary,
                    fontWeight: active ? '700' : '500',
                    fontSize: 14,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  container: {
    flexDirection: 'row',
    gap: spacing(1),
    padding: spacing(1),
    borderRadius: 10,
  },
  tab: {
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
    borderRadius: 7,
  },
});
