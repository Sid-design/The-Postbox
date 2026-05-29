// In __tests__/jest/setup.js
import 'react-native-gesture-handler/jestSetup';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// Mock vector icons to avoid requiring native modules (expo-font/expo-modules-core)
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name = 'Icon' }) => React.createElement(Text, null, `<${name}>`);
  return {
    Ionicons: Icon,
    MaterialCommunityIcons: Icon,
  };
});

// Mock haptics for tests
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  selectionAsync: jest.fn(async () => {}),
}));

// Extra guard: mock expo-font if any component tries to use it directly
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
}));

// Silence the warning about the possibility of multiple renderers
// See https://github.com/testing-library/react-native-testing-library/issues/837
jest.spyOn(console, 'error').mockImplementation(() => {}); 