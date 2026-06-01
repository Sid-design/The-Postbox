// Jest setup — runs before every test file.
// Every native module that has no web/jest equivalent must be mocked here.
// When adding a new native dependency, add its mock here too.

import 'react-native-gesture-handler/jestSetup';

// ─── Storage ──────────────────────────────────────────────────────────────────
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// ─── Crypto ───────────────────────────────────────────────────────────────────
// expo-crypto has no Jest/Node polyfill — mock digestStringAsync with a
// deterministic fake so tests depending on MD5 hashes don't crash.
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn((_algorithm, input) =>
    Promise.resolve(
      Array.from(input)
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32)
    )
  ),
  CryptoDigestAlgorithm: { MD5: 'MD5', SHA256: 'SHA256', SHA512: 'SHA512' },
}));

// ─── Notifications ─────────────────────────────────────────────────────────────
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
}));

// ─── Haptics ──────────────────────────────────────────────────────────────────
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

// ─── Device ───────────────────────────────────────────────────────────────────
jest.mock('expo-device', () => ({
  isDevice: true,
  modelName: 'iPhone Test',
  osName: 'iOS',
  osVersion: '17.0',
}));

// ─── File system ──────────────────────────────────────────────────────────────
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///test/cache/',
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false, size: 0 })),
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
}));

// ─── Network ──────────────────────────────────────────────────────────────────
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true })
  ),
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', NONE: 'NONE' },
}));

// ─── Auth session / OAuth ─────────────────────────────────────────────────────
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: 'dismiss' })),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'postbox://auth'),
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
  ResponseType: { Token: 'token', Code: 'code' },
}));

jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: () => [null, null, jest.fn()],
  useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));

// ─── WebView ──────────────────────────────────────────────────────────────────
// react-native-webview has no Jest renderer — replace with a plain View
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = (props) => React.createElement(View, { testID: 'webview', ...props });
  return { WebView, default: WebView };
});

// ─── Safe area ────────────────────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
    SafeAreaView: ({ children, ...rest }) => React.createElement(View, rest, children),
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// ─── Icons ────────────────────────────────────────────────────────────────────
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name = 'icon', testID }) =>
    React.createElement(Text, { testID: testID || `icon-${name}` }, name);
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});

// ─── Font ─────────────────────────────────────────────────────────────────────
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

// ─── Reanimated ───────────────────────────────────────────────────────────────
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// ─── Linking + React Navigation ───────────────────────────────────────────────
// @react-navigation/native v7 calls Linking.addEventListener in useLinking.
// In RN 0.79's Jest preset, Linking is undefined, causing a crash when
// NavigationContainer mounts. Fix: mock useLinking directly so it never
// tries to access Linking, while keeping all other navigation APIs real.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useLinking: () => ({
      getInitialState: {
        then: (cb) => { cb(undefined); return { catch: () => {} }; },
      },
    }),
  };
});

// Also provide Linking mock for any direct uses.
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(() => Promise.resolve()),
  canOpenURL: jest.fn(() => Promise.resolve(true)),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
  sendIntent: jest.fn(),
}));

// ─── Console suppression ──────────────────────────────────────────────────────
// Silence expected warnings to keep test output clean; leave errors visible.
jest.spyOn(console, 'error').mockImplementation((...args) => {
  // Re-throw unexpected test failures but suppress known RN warnings
  const msg = args[0]?.toString() || '';
  if (
    msg.includes('Warning: An update to') ||
    msg.includes('Warning: Cannot update') ||
    msg.includes('act(...)') ||
    msg.includes('ReactDOM.render')
  ) return;
  // Uncomment to see all errors: console._error?.(...args);
});
jest.spyOn(console, 'warn').mockImplementation(() => {});
