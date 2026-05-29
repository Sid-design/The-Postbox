import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Login: undefined;
  Inbox: undefined;
  Saved: undefined;
  Detail: { messageId: number };
  SenderManagement: undefined;
  Settings: undefined;
  ConnectedMailboxes: undefined;
};

export type Message = {
  id: number;
  sender_name: string;
  subject: string;
  snippet?: string; // Make snippet optional as it might not always be there
  is_read: boolean;
  is_saved?: boolean;
  body_html?: string;
  received_at?: string;
};

export type InboxScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Inbox'
>;
export type DetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Detail'
>;

export type SenderManagementScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'SenderManagement'
>;

export type SettingsScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Settings'
>;

export type ConnectedMailboxesScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'ConnectedMailboxes'
>;

export type SavedScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Saved'
>; 