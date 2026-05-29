module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['./__tests__/jest/setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?@?react-native|@react-native-community|@react-navigation|@sentry/react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-svg|react-native-gesture-handler|react-native-reanimated|react-native-vector-icons|react-native-safe-area-context|react-native-screens|expo-web-browser|expo-auth-session)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/jest/setup.js'],
  testTimeout: 15000,
};
