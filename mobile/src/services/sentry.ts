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
  // Wrapped in try/catch so a Sentry init failure can NEVER take down the app.
  // initSentry() runs at module-load time (App.tsx), which is OUTSIDE the React
  // ErrorBoundary — an uncaught throw here would blank the whole app before any
  // UI renders. (Sentry.wrap() is intentionally NOT used; init() alone captures
  // crashes via the global error handler.)
  try {
    Sentry.init({
      // Pass undefined (not empty string) when no DSN — Sentry treats '' as invalid
      dsn: DSN || undefined,
      // Capture events only in preview/production when a DSN is configured
      enabled: !!DSN && !__DEV__,
      environment: process.env.EXPO_PUBLIC_APP_VARIANT ?? 'development',
      tracesSampleRate: DSN ? 0.2 : 0,
      enableAutoSessionTracking: !!DSN,
      attachStacktrace: true,
    });

    if (!DSN && __DEV__) {
      console.log('[Sentry] DSN not configured — crash reporting disabled');
    }
  } catch (e) {
    console.warn('[Sentry] init failed — continuing without crash reporting:', e);
  }
}

// Re-export Sentry so screens can call Sentry.captureException() directly
export { Sentry };
