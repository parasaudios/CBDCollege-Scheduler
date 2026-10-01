import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import UpdateModal from './src/components/UpdateModal';
import { useOtaUpdate } from './src/lib/useOtaUpdate';
import { supabase } from './src/lib/supabase';
import Main from './src/Main';
import LoginScreen from './src/screens/LoginScreen';
import { ThemeProvider, useTheme } from './src/ThemeProvider';

// Supabase autoRefreshToken should only run while foregrounded.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

function Root() {
  const { palette, effective } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const { ready, applying, apply } = useOtaUpdate();
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />
      {checking ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : session ? (
        <Main session={session} />
      ) : (
        <LoginScreen />
      )}
      <UpdateModal
        visible={ready && !updateDismissed}
        applying={applying}
        onUpdate={apply}
        onLater={() => setUpdateDismissed(true)}
      />
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}
