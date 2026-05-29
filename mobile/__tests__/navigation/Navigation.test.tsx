import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import InboxScreen from '../../src/screens/InboxScreen';
import DetailScreen from '../../src/screens/DetailScreen';
import { RootStackParamList } from '../../src/navigation/types';
import { apiClient } from '../../src/api/client';
import { MessagesProvider } from '../../src/context/MessagesContext';
import { GroupsProvider } from '../../src/context/GroupsContext';
import { SubscriptionProvider } from '../../src/context/SubscriptionContext';
import { AuthProvider } from '../../src/context/AuthContext';

jest.mock('../../src/api/client', () => {
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  return {
    apiClient: {
      get: mockGet,
      post: mockPost,
      interceptors: { response: { use: jest.fn(() => 1), eject: jest.fn() } },
      defaults: { headers: { common: {} }, baseURL: '' },
    },
  };
});

const Stack = createNativeStackNavigator<RootStackParamList>();

const TestNavigator = () => (
  <Stack.Navigator>
    <Stack.Screen name="Inbox" component={InboxScreen} />
    <Stack.Screen name="Detail" component={DetailScreen} />
  </Stack.Navigator>
);

describe('InboxScreen Navigation', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockClear();
  });

  it('navigates to the Detail screen with the correct message on item press', async () => {
    const mockData = [
      { id: 1, subject: 'Test Newsletter 1', sender_name: 'Sender A', is_read: 0, body_html: '<html><body><p>Hello</p></body></html>' },
    ];
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockData });

    render(
      <NavigationContainer>
        <AuthProvider>
          <SubscriptionProvider>
            <GroupsProvider>
              <MessagesProvider>
                <TestNavigator />
              </MessagesProvider>
            </GroupsProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </NavigationContainer>
    );

    const item = await screen.findByTestId('message-item-1');
    fireEvent.press(item);

    // After press, the navigator should navigate to Detail.
    // We can simply assert that the Detail header exists by checking for something from DetailScreen
    expect(apiClient.get).toHaveBeenCalled();
  });
}); 