import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { paletteFor, radius, spacing } from '../theme';

export default function LoginScreen() {
  const palette = paletteFor(useColorScheme());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    const e = email.trim();
    if (!e || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    // On success, App.tsx's onAuthStateChange listener swaps to the home screen.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: e,
      password,
    });
    if (signInError) {
      setError(signInError.message || 'Could not sign in.');
      setBusy(false);
    }
    // Leave `busy` on when successful — the screen is about to unmount.
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.surface2 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View
            style={[styles.logoDot, { backgroundColor: palette.primary }]}
          >
            <Text style={styles.logoDotText}>CBD</Text>
          </View>
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            CBD College Scheduler
          </Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            Sign in to view the roster
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.label, { color: palette.textSecondary }]}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            editable={!busy}
            style={[
              styles.input,
              {
                backgroundColor: palette.surface2,
                borderColor: palette.border,
                color: palette.textPrimary,
              },
            ]}
          />

          <Text
            style={[
              styles.label,
              { color: palette.textSecondary, marginTop: spacing(4) },
            ]}
          >
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={palette.textMuted}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            editable={!busy}
            onSubmitEditing={onSignIn}
            style={[
              styles.input,
              {
                backgroundColor: palette.surface2,
                borderColor: palette.border,
                color: palette.textPrimary,
              },
            ]}
          />

          {error ? (
            <Text style={[styles.error, { color: palette.danger }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={onSignIn}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: palette.primary,
                opacity: busy ? 0.7 : pressed ? 0.9 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={palette.onPrimary} />
            ) : (
              <Text style={[styles.buttonText, { color: palette.onPrimary }]}>
                Sign in
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={[styles.foot, { color: palette.textMuted }]}>
          Use the same login as the web scheduler.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing(6),
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing(8),
  },
  logoDot: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(4),
  },
  logoDotText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    marginTop: spacing(1),
  },
  card: {
    borderRadius: radius,
    borderWidth: 1,
    padding: spacing(5),
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing(2),
  },
  input: {
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 16,
  },
  error: {
    marginTop: spacing(4),
    fontSize: 14,
  },
  button: {
    marginTop: spacing(6),
    borderRadius: radius,
    paddingVertical: spacing(4),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  foot: {
    textAlign: 'center',
    marginTop: spacing(6),
    fontSize: 13,
  },
});
