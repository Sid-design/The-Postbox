// True only in CI builds compiled with EXPO_PUBLIC_E2E=1 (never production).
// In this mode the app seeds a stub session (see AuthContext) so Maestro can
// reach the logged-in screens. Because the stub token is rejected by the
// backend, feature code should use this flag to suppress blocking error dialogs
// and skip device-only work (push registration) so screens render cleanly for
// screenshots.
export const IS_E2E = process.env.EXPO_PUBLIC_E2E === '1';
