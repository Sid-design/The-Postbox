/**
 * @react-navigation/native-stack mock for Jest.
 *
 * Provides a minimal createNativeStackNavigator that renders screens without
 * requiring any native modules (react-native-screens is not available in Jest).
 * Only the first screen in the navigator is rendered (sufficient for unit tests
 * that care about screen content, not navigation transitions).
 */
const React = require('react');
const { View } = require('react-native');

function createNativeStackNavigator() {
  const screens = [];

  const Navigator = ({ children }) => {
    // Collect Screen registrations
    React.Children.forEach(children, (child) => {
      if (child && child.type && child.type._isScreen) {
        screens.push(child);
      }
    });
    // Render first screen by default
    const firstScreen = React.Children.toArray(children)[0];
    if (firstScreen && firstScreen.props && firstScreen.props.component) {
      const Component = firstScreen.props.component;
      return React.createElement(View, { testID: 'navigator' },
        React.createElement(Component, {
          navigation: {
            navigate: jest.fn(),
            goBack: jest.fn(),
            setOptions: jest.fn(),
            getParent: jest.fn(() => ({ setOptions: jest.fn() })),
          },
          route: {
            key: firstScreen.props.name,
            name: firstScreen.props.name,
            params: {},
          },
        })
      );
    }
    return React.createElement(View, { testID: 'empty-navigator' });
  };

  const Screen = (props) => null;
  Screen._isScreen = true;

  return { Navigator, Screen };
}

module.exports = { createNativeStackNavigator };
