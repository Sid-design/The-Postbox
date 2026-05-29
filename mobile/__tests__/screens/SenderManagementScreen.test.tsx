import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SenderManagementScreen from '../../src/screens/SenderManagementScreen';
import { apiClient } from '../../src/api/client';
import { SubscriptionProvider } from '../../src/context/SubscriptionContext';

jest.mock('../../src/api/client');

const Stack = createNativeStackNavigator();

const Wrapper = () => (
  <SubscriptionProvider>
    <Stack.Navigator>
      <Stack.Screen name="SenderManagementRoot" component={SenderManagementScreen} />
    </Stack.Navigator>
  </SubscriptionProvider>
);

describe('SenderManagementScreen', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    (apiClient.get as jest.Mock).mockClear();
  });

  it('renders the list of senders fetched from the API', async () => {
    const mockSenders = [
      { id: 1, name: 'TechCrunch', email: 'tc@example.com', is_active: 1 },
      { id: 2, name: 'The New York Times', email: 'nyt@example.com', is_active: 0 },
    ];
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockSenders });

    render(
      <NavigationContainer>
        <Wrapper />
      </NavigationContainer>
    );

    expect(await screen.findByText('TechCrunch')).toBeTruthy();
    expect(await screen.findByText('The New York Times')).toBeTruthy();
  });
}); 