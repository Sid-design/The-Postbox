import React from 'react';
import { render, within, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import InboxScreen from '../src/screens/InboxScreen';
import { apiClient } from '../src/api/client';
import { MessagesProvider } from '../src/context/MessagesContext';
import { GroupsProvider } from '../src/context/GroupsContext';
import { SubscriptionProvider } from '../src/context/SubscriptionContext';
import { AuthProvider } from '../src/context/AuthContext';

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

// Helper to wrap component in NavigationContainer and required Providers
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <NavigationContainer>
      <AuthProvider>
        <SubscriptionProvider>
          <GroupsProvider>
            <MessagesProvider>
              {component}
            </MessagesProvider>
          </GroupsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </NavigationContainer>
  );
};

describe('InboxScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    setOptions: jest.fn(),
  } as any;
  const mockRoute = { key: 'Inbox', name: 'Inbox' } as any;

  beforeEach(() => {
    (apiClient.get as jest.Mock).mockClear();
  });

  const mockData = [
    { id: 1, subject: 'Test Newsletter 1', sender_name: 'Sender A', is_read: 0 },
    { id: 2, subject: 'Test Newsletter 2', sender_name: 'Sender B', is_read: 1 },
  ];

  it('renders the list of newsletters correctly after fetching', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockData });
    renderWithProviders(<InboxScreen navigation={mockNavigation} route={mockRoute} />);

    expect(await screen.findByText('Test Newsletter 1')).toBeTruthy();
    expect(await screen.findByText('Sender A')).toBeTruthy();
    expect(await screen.findByText('Test Newsletter 2')).toBeTruthy();
    expect(await screen.findByText('Sender B')).toBeTruthy();
  });

  it('displays an unread badge for unread items', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockData });
    renderWithProviders(<InboxScreen navigation={mockNavigation} route={mockRoute} />);

    const unreadItem = await screen.findByTestId('message-item-1');
    const badge = within(unreadItem).queryByTestId('unread-badge');
    expect(badge).toBeTruthy();
  });

  it('does not display an unread badge for read items', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockData });
    renderWithProviders(<InboxScreen navigation={mockNavigation} route={mockRoute} />);

    const readItem = await screen.findByTestId('message-item-2');
    const badge = within(readItem).queryByTestId('unread-badge');
    expect(badge).toBeFalsy();
  });
}); 