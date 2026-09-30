// Supabase client for React Native.
//
// `react-native-url-polyfill/auto` must be imported before supabase-js so that
// the URL/URLSearchParams globals exist in the Hermes runtime.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Persist the session in AsyncStorage so the user stays logged in across
    // app restarts.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based auth callbacks on native (that's a web-only concern).
    detectSessionInUrl: false,
  },
});
