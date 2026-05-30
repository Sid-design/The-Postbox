// CNG / Managed config. The native ios/ & android/ folders are NOT uploaded to
// EAS (see mobile/.easignore) so EAS runs `expo prebuild` on the build server
// and generates the native projects FROM THIS FILE. Every native setting must
// therefore live here — anything only present in a hand-edited ios/ folder is
// ignored. (Previously this project was "bare": ios/ was uploaded and prebuild
// was skipped, so plugins/ios/scheme here were silently dropped — that mismatch
// was the root cause of the standalone black screen. See CLAUDE.md.)

const IS_PROD = process.env.EXPO_PUBLIC_APP_VARIANT === 'production';

const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT || 'development';
const APP_NAME =
  process.env.EXPO_PUBLIC_APP_NAME ||
  (IS_PROD ? 'The Postbox' : 'The Postbox (Dev)');

// NOTE: bundle identifier is intentionally the SAME for every variant for now.
// It matches the EAS credentials / provisioning profile and the Google iOS
// OAuth client used by builds 5–10. Splitting dev/prod IDs later requires new
// credentials + a matching Google OAuth client (tracked as tech debt).
const BUNDLE_ID = 'io.thepostbox.app';
const APP_SCHEME = IS_PROD ? 'postbox' : 'postbox-dev';
const APP_SLUG = 'newsletter-reader'; // Keep same slug for EAS project consistency

// Reversed-client-ID URL scheme for the Google iOS OAuth client. The OAuth
// redirect in LoginScreen.tsx depends on this being registered natively.
const GOOGLE_IOS_URL_SCHEME =
  'com.googleusercontent.apps.493373719535-v990sc2u46lgga6nkbt962isqr7518ni';

export default {
  expo: {
    name: APP_NAME,
    slug: APP_SLUG,
    scheme: APP_SCHEME,
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // Preserve the App Transport Security posture from the old native
        // Info.plist (HTTPS-only, but allow local networking for the dev
        // Metro server).
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
        },
        // Register the Google OAuth reversed-client-ID scheme. `scheme` above
        // already registers the app scheme; this adds the one Google needs.
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [GOOGLE_IOS_URL_SCHEME],
          },
        ],
      },
    },
    plugins: [
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '15.6',
            // Match the architecture the app has actually been running on.
            // The committed bare ios/ project never enabled the new
            // architecture, so the app has only ever run on the old one.
            // Keep it off here to avoid introducing new-arch regressions in
            // the same change that fixes the black screen.
            newArchEnabled: false,
          },
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '28b83ffb-dfc8-40e9-955a-b011fe8d8aee',
      },
      APP_VARIANT,
      APP_NAME,
    },
  },
};
