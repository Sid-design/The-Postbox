/**
 * Pre-framework setup — runs BEFORE jest environment initialises.
 * Only use this for patching globals and native modules that must exist
 * before any module imports run. Cannot use jest.fn() or jest.mock() here.
 *
 * Primary purpose: patch the react-native Linking module so that
 * @react-navigation/native's useLinking.native.tsx can call
 * Linking.addEventListener('url', ...) without crashing.
 */

// In RN 0.79's Jest preset, the Linking NativeModule may be undefined.
// We patch it here (before any module imports) so NavigationContainer mounts.
const noop = () => {};
const noopSubscription = { remove: noop };

global.__patchLinking = () => {
  try {
    const { Linking } = require('react-native');
    if (Linking && typeof Linking.addEventListener !== 'function') {
      Linking.addEventListener = () => noopSubscription;
    }
    if (Linking && typeof Linking.getInitialURL !== 'function') {
      Linking.getInitialURL = () => Promise.resolve(null);
    }
    if (Linking && typeof Linking.removeEventListener !== 'function') {
      Linking.removeEventListener = noop;
    }
    if (Linking && typeof Linking.openURL !== 'function') {
      Linking.openURL = () => Promise.resolve();
    }
    if (Linking && typeof Linking.canOpenURL !== 'function') {
      Linking.canOpenURL = () => Promise.resolve(true);
    }
  } catch (_) {}
};
