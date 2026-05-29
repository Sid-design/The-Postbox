const IS_DEV = process.env.EXPO_PUBLIC_APP_VARIANT === 'development';
const IS_PROD = process.env.EXPO_PUBLIC_APP_VARIANT === 'production';

// Default to development if no variant is set
const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT || 'development';
const APP_NAME =
  process.env.EXPO_PUBLIC_APP_NAME ||
  (IS_PROD ? 'The Postbox' : 'The Postbox (Dev)');

// Bundle identifier logic
const BUNDLE_ID = IS_PROD ? 'io.thepostbox.app' : 'io.thepostbox.dev';
const APP_SCHEME = IS_PROD ? 'postbox' : 'postbox-dev'; // cleaner URL scheme
const APP_SLUG = 'newsletter-reader'; // Keep same slug for EAS project consistency

export default {
  expo: {
    name: APP_NAME,
    slug: APP_SLUG,
    scheme: APP_SCHEME,
    version: '1.0.0',
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    plugins: [
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '15.6',
            newArchEnabled: true,
          },
        },
      ],
      'expo-notifications',
      'expo-font',
      'expo-secure-store',
    ],
    extra: {
      eas: {
        projectId: '28b83ffb-dfc8-40e9-955a-b011fe8d8aee',
      },
      // Make app variant available to the app
      APP_VARIANT,
      APP_NAME,
    },
  },
};





