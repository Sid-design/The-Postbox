import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import { AuthProvider } from '../src/context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import { SubscriptionProvider } from '../src/context/SubscriptionContext';
import { GroupsProvider } from '../src/context/GroupsContext';
import { apiClient } from '../src/api/client';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';

jest.mock('expo-secure-store');
jest.mock('../src/api/client', () => {
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
jest.mock('../src/services/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));
jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: () => [null, null, jest.fn()],
  useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));

const renderWithProviders = (initialToken: string | null) => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(initialToken);
  (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });

  render(
    <AuthProvider>
      <SubscriptionProvider>
        <GroupsProvider>
          <App />
        </GroupsProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
};

// The actual tests
describe('App', () => {
  it('renders LoginScreen when not authenticated', async () => {
    renderWithProviders(null);
    await waitFor(() => expect(screen.queryByText('Sign in with Google')).toBeTruthy());
  });

  it('renders InboxScreen when authenticated', async () => {
    renderWithProviders('fake-jwt-token');
    await waitFor(() => expect(screen.queryByText('Your inbox is empty.')).toBeTruthy());
  });
}); 