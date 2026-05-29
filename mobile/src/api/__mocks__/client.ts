import { Message } from '../../navigation/types';
import { Sender } from '../client';

export const MOCK_API_DATA: Message[] = [
  {
    id: 1,
    sender_name: 'TechCrunch',
    subject: 'The Latest in Tech',
    snippet: 'Apple announces new products...',
    is_read: false,
    body_html: '<h1>Test</h1>',
  },
  {
    id: 2,
    sender_name: 'The New York Times',
    subject: 'Morning Briefing',
    snippet: 'Your daily news update.',
    is_read: true,
    body_html: '<h1>Test 2</h1>',
  },
];

export const MOCK_SENDERS: Sender[] = [
  { id: 1, name: 'TechCrunch', email: 'tc@fake.com', is_active: true },
  { id: 2, name: 'The New York Times', email: 'nyt@fake.com', is_active: true },
];

export const getMessages = jest.fn().mockResolvedValue(MOCK_API_DATA);
export const getSenders = jest.fn().mockResolvedValue(MOCK_SENDERS);
export const toggleSubscription = jest.fn().mockResolvedValue(undefined);

export const apiClient = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  defaults: {
    headers: {
      common: {},
    },
  },
}; 