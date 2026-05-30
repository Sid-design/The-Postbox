/**
 * Sentry crash reporting initialisation.
 *
 * SETUP (one-time, per developer):
 *   1. Go to https://sentry.io and create a free account.
 *   2. Create a new project → React Native → name it "the-postbox-mobile".
 *   3. Copy the DSN from Project Settings → Client Keys.
 *   4. In mobile/eas.json, replace the empty EXPO_PUBLIC_SENTRY_DSN value
 *      in the "preview" and "production" profiles with your DSN.
 *      e.g. "EXPO_PUBLIC_SENTRY_DSN": "https://abc123@o123456.ingest.sentry.io/789"
 *
 * The DSN is safe to commit — it is a public client identifier, not a secret.
 * Sentry is intentionally disabled in development builds (use the Metro
 * error overlay there) and when the DSN is not configured.
 */
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

export function initSentry(): void {
  if (!DSN) {
    if (__DEV__) {
      console.log('[Sentry] DSN not configured — crash reporting disabled');
    }
    return;
  }

  Sentry.init({
    dsn: DSN,
    // Only capture events in preview/production — dev builds use Metro overlay
    enabled: !__DEV__,
    environment: process.env.EXPO_PUBLIC_APP_VARIANT ?? 'development',
    // Capture 20 % of transactions for performance monitoring
    tracesSampleRate: 0.2,
    // Capture 100 % of sessions (low volume solo app)
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    // Attach JS console.error output as breadcrumbs
    attachStacktrace: true,
  });
}

// Re-export Sentry so screens can call Sentry.captureException() directly
export { Sentry };
