import { ScrollView, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { useTheme } from '../ThemeProvider';
import { spacing } from '../theme';

export default function Placeholder({ title, note }: { title: string; note?: string }) {
  const { palette } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.surface2 }}
      contentContainerStyle={{ padding: spacing(3) }}
    >
      <Card>
        <View style={{ padding: spacing(5) }}>
          <Text style={{ color: palette.textPrimary, fontSize: 18, fontWeight: '700' }}>
            {title}
          </Text>
          <Text style={{ color: palette.textMuted, marginTop: spacing(2) }}>
            {note || 'Coming in this build.'}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}
