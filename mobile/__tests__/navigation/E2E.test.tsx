import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../App';
import { apiClient } from '../../src/api/client';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider } from '../../src/context/AuthContext';
import { SubscriptionProvider } from '../../src/context/SubscriptionContext';
import { GroupsProvider } from '../../src/context/GroupsContext';

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
jest.mock('expo-secure-store');
jest.mock('../../src/services/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));
jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: () => [null, null, jest.fn()],
}));

const renderApp = () => {
  return render(
    <AuthProvider>
      <SubscriptionProvider>
        <GroupsProvider>
          <App />
        </GroupsProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
};

describe('App E2E Navigation', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
  });

  it('navigates from Inbox to Detail screen', async () => {
    // Start authenticated
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('fake-jwt-token');

    // Inbox messages
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [
      { id: 1, subject: 'E2E Subject', sender_name: 'E2E Sender', is_read: false },
    ]});

    // Detail message fetch
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { id: 1, body_html: '<html><body>E2E Body</body></html>' } });

    renderApp();

    await waitFor(() => expect(screen.getByText('E2E Sender')).toBeTruthy());

    fireEvent.press(screen.getByText('E2E Sender'));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/messages/1'));
  });
}); 