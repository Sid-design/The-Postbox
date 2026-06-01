/**
 * @react-navigation/native mock for Jest.
 *
 * Provides stub implementations for all hooks and a thin NavigationContainer
 * that just renders children — no Linking, no native screens, no router state.
 * This allows screens to mount in Jest without any native module dependencies.
 *
 * Screens get a consistent theme (light) and navigation mock via hooks.
 * Tests that need to verify navigation calls should mock useNavigation() in
 * the test file or check the injected mockNavigation.navigate/goBack calls.
 */
const React = require('react');
const { View } = require('react-native');

// ─── Theme ────────────────────────────────────────────────────────────────────
const LIGHT_THEME = {
  dark: false,
  colors: {
    primary: '#4A90E2',
    background: '#F4F6F8',
    card: '#FFFFFF',
    text: '#1A202C',
    border: '#F4F6F8',
    notification: '#4A90E2',
  },
};

// ─── Navigation mock (shared, spyable in tests) ───────────────────────────────
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  getParent: jest.fn(() => ({ setOptions: jest.fn() })),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
  dispatch: jest.fn(),
  reset: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => false),
};

// ─── Exports ──────────────────────────────────────────────────────────────────
// ─── Theme context (needed by useTheme from @react-navigation/core) ───────────
const ThemeContext = React.createContext(LIGHT_THEME);

// Wrap children in ThemeContext.Provider so useTheme() doesn't throw
const NavigationContainer = ({ children }) =>
  React.createElement(ThemeContext.Provider, { value: LIGHT_THEME },
    React.createElement(View, { testID: 'navigation-container' }, children)
  );

// Patch @react-navigation/core's ThemeContext + navigation context
try {
  const core = require('@react-navigation/core');
  // Theme context — makes useTheme() return light theme without NavigationContainer
  if (core.ThemeContext) {
    core.ThemeContext._currentValue = LIGHT_THEME;
    core.ThemeContext._currentValue2 = LIGHT_THEME;
  }
  // Navigation context — makes useNavigation() return mockNavigation
  if (core.NavigationContext) {
    core.NavigationContext._currentValue = mockNavigation;
    core.NavigationContext._currentValue2 = mockNavigation;
  }
  if (core.NavigationRouteContext) {
    const mockRoute = { key: 'test', name: 'Test', params: {} };
    core.NavigationRouteContext._currentValue = mockRoute;
    core.NavigationRouteContext._currentValue2 = mockRoute;
  }
} catch (_) {}

module.exports = {
  // NavigationContainer: wraps in ThemeContext so useTheme() works
  NavigationContainer,

  // Hooks
  useNavigation: () => mockNavigation,
  useTheme: () => LIGHT_THEME,
  useRoute: () => ({ key: 'test', name: 'Test', params: {} }),
  useFocusEffect: (cb) => { React.useEffect(cb, []); },
  useIsFocused: () => true,
  useNavigationState: (selector) => selector({ routes: [], index: 0 }),
  useScrollToTop: () => {},

  // Utilities
  DefaultTheme: LIGHT_THEME,
  DarkTheme: { ...LIGHT_THEME, dark: true },
  ThemeProvider: ({ children }) => React.createElement(View, null, children),
  Link: ({ children }) => React.createElement(View, null, children),

  // Export the mock navigation object so tests can assert on it
  __mockNavigation: mockNavigation,

  // Navigation actions (pass-through from actual)
  ...require('@react-navigation/core'),
};
