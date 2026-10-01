import { Modal, StyleSheet, Text, View } from 'react-native';
import { Btn } from './ui';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../theme';

// Prompts the user when an OTA update has been downloaded and is ready to apply.
// "Update now" restarts straight into the new version.
export default function UpdateModal({
  visible,
  applying,
  onUpdate,
  onLater,
}: {
  visible: boolean;
  applying: boolean;
  onUpdate: () => void;
  onLater: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Update available</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            A new version of the scheduler is ready. Update now to get the latest — it
            only takes a second.
          </Text>
          <Btn label="Update now" busy={applying} onPress={onUpdate} style={{ marginTop: spacing(5) }} />
          <Btn label="Later" variant="outline" disabled={applying} onPress={onLater} style={{ marginTop: spacing(2) }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing(6) },
  card: { borderRadius: 16, borderWidth: 1, padding: spacing(6), alignItems: 'center' },
  emoji: { fontSize: 40, marginBottom: spacing(2) },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', marginTop: spacing(2), lineHeight: 21 },
});
