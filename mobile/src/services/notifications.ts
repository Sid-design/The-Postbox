import { Platform, Alert } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerDeviceToken } from '../api/client';
import { IS_E2E } from '../config/e2e';

// This is required for notifications to show up while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  // In E2E/CI builds there is no physical device and no real session; skip push
  // registration entirely so it doesn't pop the "Must use physical device" alert
  // over the screens Maestro is trying to screenshot.
  if (IS_E2E) {
    return;
  }
  let token;
  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    console.log('[NOTIFICATIONS] Initial permission status:', existingStatus);

    if (existingStatus !== 'granted') {
      console.log('[NOTIFICATIONS] Requesting permissions...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[NOTIFICATIONS] Permission status after request:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('[NOTIFICATIONS] Permission denied, showing alert');
      Alert.alert('Push notifications are required to receive new newsletter alerts. You can enable them later in Settings > Notifications.');
      return;
    }
    // Learn more about projectId from https://docs.expo.dev/guides/push-notifications/#minimum-requirements
    // Wrapped in try/catch: on builds without a valid APNs entitlement/key this
    // throws "no valid aps-environment entitlement". Push is non-essential to
    // app function, so swallow the error rather than let it become an unhandled
    // promise rejection (which Sentry was logging post-CNG-migration).
    try {
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: '28b83ffb-dfc8-40e9-955a-b011fe8d8aee', // Expo project ID from app.json
        })
      ).data;
      console.log(token);
    } catch (error) {
      console.warn('[NOTIFICATIONS] Could not get push token (push disabled):', error instanceof Error ? error.message : error);
      return;
    }
  } else {
    Alert.alert('Must use physical device for Push Notifications');
  }

  if (token) {
    console.log('[NOTIFICATIONS] Got push token:', token.substring(0, 20) + '...');
    await registerDeviceToken(token);
  } else {
    console.log('[NOTIFICATIONS] No token received');
  }
}

// Check current notification permissions
export async function checkNotificationPermissions() {
  const { status } = await Notifications.getPermissionsAsync();
  console.log('[NOTIFICATIONS] Current permission status:', status);
  return status;
}

// Request notification permissions (can be called from settings)
export async function requestNotificationPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  console.log('[NOTIFICATIONS] Permission request result:', status);
  return status;
}

// Set up notification channels for Android
export async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    const soundEnabled = await getNotificationSoundEnabled();

    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4A90E2',
      sound: soundEnabled ? 'default' : null,
    });

    await Notifications.setNotificationChannelAsync('newsletter', {
      name: 'Newsletter Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4A90E2',
      sound: soundEnabled ? 'default' : null,
    });
  }
}

// Notification settings management
export type NotificationFrequency = 'immediate' | 'hourly' | 'daily' | 'weekly';

export interface NotificationSettings {
  pushNotifications: boolean;
  notificationSound: boolean;
  notificationFrequency: NotificationFrequency;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  pushNotifications: true,
  notificationSound: true,
  notificationFrequency: 'immediate',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

// Get notification settings from storage
export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const settings = await AsyncStorage.getItem('notificationSettings');
    if (settings) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(settings) };
    }
    return DEFAULT_NOTIFICATION_SETTINGS;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error loading notification settings:', error);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

// Save notification settings to storage
export async function saveNotificationSettings(settings: Partial<NotificationSettings>): Promise<void> {
  try {
    const currentSettings = await getNotificationSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    await AsyncStorage.setItem('notificationSettings', JSON.stringify(updatedSettings));

    // Update notification channels if sound setting changed
    if (settings.notificationSound !== undefined) {
      await setupNotificationChannels();
    }

    console.log('[NOTIFICATIONS] Settings saved:', updatedSettings);
  } catch (error) {
    console.error('[NOTIFICATIONS] Error saving notification settings:', error);
  }
}

// Check if notifications should be sent based on user preferences
export async function shouldSendNotification(): Promise<boolean> {
  try {
    const settings = await getNotificationSettings();

    // Check if push notifications are enabled
    if (!settings.pushNotifications) {
      console.log('[NOTIFICATIONS] Push notifications disabled by user');
      return false;
    }

    // Check quiet hours
    if (settings.quietHoursEnabled) {
      const now = new Date();
      const currentTime = now.getHours() * 100 + now.getMinutes();
      const startTime = parseTimeToMinutes(settings.quietHoursStart);
      const endTime = parseTimeToMinutes(settings.quietHoursEnd);

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (startTime > endTime) {
        if (currentTime >= startTime || currentTime <= endTime) {
          console.log('[NOTIFICATIONS] Currently in quiet hours');
          return false;
        }
      } else {
        if (currentTime >= startTime && currentTime <= endTime) {
          console.log('[NOTIFICATIONS] Currently in quiet hours');
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error checking notification preferences:', error);
    return true; // Default to sending if there's an error
  }
}

// Get specific notification setting
export async function getNotificationSoundEnabled(): Promise<boolean> {
  const settings = await getNotificationSettings();
  return settings.notificationSound;
}

export async function getNotificationFrequency(): Promise<NotificationFrequency> {
  const settings = await getNotificationSettings();
  return settings.notificationFrequency;
}

export async function getPushNotificationsEnabled(): Promise<boolean> {
  const settings = await getNotificationSettings();
  return settings.pushNotifications;
}

// Helper function to convert HH:MM to minutes since midnight
function parseTimeToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
} 