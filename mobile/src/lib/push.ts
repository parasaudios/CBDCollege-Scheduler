// Native (Expo) push notifications: register the device token, save it to
// Supabase, and show notifications in the foreground. Delivery is done by the
// send-native-push edge function reading cbd_expo_push_tokens.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Show a banner + play a sound even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const anyC = Constants as any;
  return anyC?.expoConfig?.extra?.eas?.projectId || anyC?.easConfig?.projectId || undefined;
}

// Ask permission, get the Expo push token, and store it. No-op on simulators or
// when permission is denied. Safe to call on every launch.
export async function registerForPush(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const pid = projectId();
    const tokenResp = await Notifications.getExpoPushTokenAsync(pid ? { projectId: pid } : undefined);
    const token = tokenResp.data;
    if (!token) return;

    await supabase
      .from('cbd_expo_push_tokens')
      .upsert(
        { token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      );
  } catch {
    // Push is best-effort; never block the app on it.
  }
}

// Register a handler for when the user taps a notification. Returns an unsubscribe.
export function onNotificationTap(cb: (data: Record<string, any>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = (resp.notification.request.content.data || {}) as Record<string, any>;
    cb(data);
  });
  return () => sub.remove();
}
