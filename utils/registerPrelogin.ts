// /utils/registerPrelogin.ts
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getOrCreateDeviceId } from './deviceId';

export async function registerPrelogin(apiBaseUrl: string, rawPhone: string) {
  const device_id = await getOrCreateDeviceId();

  let token = 'web-no-token';
  try {
    if (Platform.OS !== 'web') {
      let perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) perm = await Notifications.requestPermissionsAsync();
      if (perm.granted) {
        const projectId =
          (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
          (Constants as any)?.easConfig?.projectId;
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } else {
        console.warn('🚫 Push permission not granted; registering without token');
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not get Expo token, registering without token', e);
  }

  // Fire-and-forget is fine; don’t block UX if this fails
  try {
    await fetch(`${apiBaseUrl}/prelogin/register-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: rawPhone,
        device_id,
        token,
        platform: Platform.OS,
        app_version: (Constants as any).nativeAppVersion ?? 'dev',
      }),
    });
  } catch (e) {
    console.warn('❌ prelogin/register-device failed', e);
  }

  return device_id; // handy if caller wants it
}
