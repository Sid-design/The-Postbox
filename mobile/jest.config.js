module.exports = {
  preset: 'react-native',
  // setupFiles runs BEFORE jest framework — patch native modules here.
  setupFiles: ['./__tests__/jest/preSetup.js'],
  // setupFilesAfterEnv runs AFTER jest framework — jest.mock() calls go here.
  setupFilesAfterEnv: ['./__tests__/jest/setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?@?react-native|@react-native-community|@react-navigation|@sentry/react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-svg|react-native-gesture-handler|react-native-reanimated|react-native-vector-icons|react-native-safe-area-context|react-native-screens|expo-web-browser|expo-auth-session)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/jest/setup.js',
    '/__tests__/jest/preSetup.js',
  ],
  testTimeout: 15000,
  moduleNameMapper: {
    // @react-navigation/native: stub useLinking to avoid Linking.addEventListener crash
    // (Linking is undefined in RN 0.79 Jest environment)
    '^@react-navigation/native$': '<rootDir>/__mocks__/@react-navigation/native.js',
    '^@react-navigation/native/(.*)': '<rootDir>/node_modules/@react-navigation/native/$1',
    // navigation navigators: replace with lightweight JS mocks
    // (avoids native module access at module load time for screens + bottom-tabs)
    '^@react-navigation/native-stack$': '<rootDir>/__mocks__/@react-navigation/native-stack.js',
    '^@react-navigation/native-stack/(.*)': '<rootDir>/node_modules/@react-navigation/native-stack/$1',
    '^@react-navigation/bottom-tabs$': '<rootDir>/__mocks__/@react-navigation/bottom-tabs.js',
    '^@react-navigation/bottom-tabs/(.*)': '<rootDir>/node_modules/@react-navigation/bottom-tabs/$1',
  },
};
