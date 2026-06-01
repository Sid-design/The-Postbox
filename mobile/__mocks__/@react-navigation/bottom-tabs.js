/**
 * @react-navigation/bottom-tabs mock for Jest.
 * Renders only the first tab's content — sufficient for navigation unit tests.
 */
const React = require('react');
const { View } = require('react-native');

function createBottomTabNavigator() {
  const Navigator = ({ children }) => {
    const firstTab = React.Children.toArray(children)[0];
    if (firstTab && firstTab.props && firstTab.props.component) {
      const Component = firstTab.props.component;
      return React.createElement(View, { testID: 'tab-navigator' },
        React.createElement(Component, {
          navigation: {
            navigate: jest.fn(),
            goBack: jest.fn(),
            setOptions: jest.fn(),
            getParent: jest.fn(() => ({ setOptions: jest.fn() })),
          },
          route: {
            key: firstTab.props.name || 'tab',
            name: firstTab.props.name || 'tab',
            params: {},
          },
        })
      );
    }
    return React.createElement(View, { testID: 'empty-tab-navigator' });
  };

  const Screen = (props) => null;
  Screen._isTabScreen = true;

  return { Navigator, Screen };
}

module.exports = { createBottomTabNavigator };
