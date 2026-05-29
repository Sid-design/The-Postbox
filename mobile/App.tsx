import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Button, ActivityIndicator, View, useColorScheme } from 'react-native';

// Test console logging
if (__DEV__) {
  console.log('🚀 Newsletter Reader App Started');
}
import { NavigationContainer, useTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
// @ts-ignore - module will be available once dependency is installed
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import InboxScreen from './src/screens/InboxScreen';
import DetailScreen from './src/screens/DetailScreen';
import SenderManagementScreen from './src/screens/SenderManagementScreen';
import LoginScreen from './src/screens/LoginScreen';
import { RootStackParamList } from './src/navigation/types';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MessagesProvider } from './src/context/MessagesContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { GroupsProvider } from './src/context/GroupsContext';
import { registerForPushNotificationsAsync, setupNotificationChannels } from './src/services/notifications';
import * as Notifications from 'expo-notifications';
import { navigationTheme } from './src/navigation/navigationTheme';
import SavedScreen from './src/screens/SavedScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ConnectedMailboxesScreen from './src/screens/ConnectedMailboxesScreen';

// (Unused root stack removed – each tab manages its own stack)

// Stack for Inbox and related screens
const InboxStack = createNativeStackNavigator<RootStackParamList>();

const InboxStackNavigator = () => {
  const theme = useTheme();
  return (
    <InboxStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTintColor: theme.colors.text,
      }}
    >
      <InboxStack.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          headerTitle: 'Inbox',
        }}
      />
      <InboxStack.Screen
        name="Detail"
        component={DetailScreen}
        options={{ headerTitle: '' }}
      />
    </InboxStack.Navigator>
  );
};

// Stack for Saved and related screens
const SavedStack = createNativeStackNavigator<RootStackParamList>();

const SavedStackNavigator = () => {
  const theme = useTheme();
  return (
    <SavedStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTintColor: theme.colors.text,
      }}
    >
      <SavedStack.Screen
        name="Saved"
        component={SavedScreen}
        options={{ title: 'Saved' }}
      />
      <SavedStack.Screen
        name="Detail"
        component={DetailScreen}
        options={{ title: 'Newsletter' }}
      />
    </SavedStack.Navigator>
  );
};

// Subscriptions stack (for now only SenderManagement)
const SubscriptionsStack = createNativeStackNavigator<RootStackParamList>();

const SubscriptionsStackNavigator = () => {
  const theme = useTheme();
  return (
    <SubscriptionsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTintColor: theme.colors.text,
      }}
    >
      <SubscriptionsStack.Screen
        name="SenderManagement"
        component={SenderManagementScreen}
        options={{ title: 'Subscriptions' }}
      />
    </SubscriptionsStack.Navigator>
  );
};

// Stack for Settings and related screens
const SettingsStack = createNativeStackNavigator<RootStackParamList>();

const SettingsStackNavigator = () => {
  const theme = useTheme();
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTintColor: theme.colors.text,
      }}
    >
      <SettingsStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </SettingsStack.Navigator>
  );
};

// Main tab navigator
const Tab = createBottomTabNavigator();

const MainTabs = () => {
  const colors = useTheme().colors;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text,
        tabBarStyle: {
          paddingTop: 8,
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'mail';
          switch (route.name) {
            case 'MailboxTab':
              iconName = 'mail';
              break;
            case 'SubscriptionsTab':
              iconName = 'list';
              break;
            case 'ExploreTab':
              iconName = 'compass';
              break;
            case 'SavedTab':
              iconName = 'bookmark';
              break;
            case 'SettingsTab':
              iconName = 'settings';
              break;
          }
          return <Ionicons name={iconName} size={size * 0.95} color={color} />; // Reduced icon size to 85% of default
        },
      })}
    >
      <Tab.Screen
        name="MailboxTab"
        component={InboxStackNavigator}
        options={{
          title: 'Mailbox',
          tabBarActiveBackgroundColor: 'transparent',
          tabBarInactiveBackgroundColor: 'transparent',
          tabBarStyle: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            paddingBottom: 2,
            paddingTop: 8,
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          },
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="SubscriptionsTab"
        component={SubscriptionsStackNavigator}
        options={{
          title: 'Sender',
          tabBarActiveBackgroundColor: 'transparent',
          tabBarInactiveBackgroundColor: 'transparent',
          tabBarStyle: {
            position: 'absolute',
          },
          tabBarLabelStyle: {
            fontSize: 11, // Reduced font size for subscriptions tab
          },
          headerShown: false,
        }}
      />
      {/* ExploreTab removed for MVP - will be added back later */}
      <Tab.Screen
        name="SavedTab"
        component={SavedStackNavigator}
        options={{
          title: 'Saved',
          tabBarActiveBackgroundColor: 'transparent',
          tabBarInactiveBackgroundColor: 'transparent',
          tabBarStyle: {
            position: 'absolute',
          },
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{
          title: 'Settings',
          tabBarActiveBackgroundColor: 'transparent',
          tabBarInactiveBackgroundColor: 'transparent',
          tabBarStyle: {
            position: 'absolute',

            
          },
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
};

const AuthNavigator = () => {
  const { authToken, isLoading } = useAuth();

  useEffect(() => {
    if (authToken) {
      // Set up notification channels first, then register for push notifications
      setupNotificationChannels().then(() => {
        registerForPushNotificationsAsync();
      }).catch((error) => {
        console.error('[APP] Failed to set up notification channels:', error);
        registerForPushNotificationsAsync();
      });
    }
  }, [authToken]);

  // Handle received notifications
  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('[NOTIFICATION] Received notification:', notification);

      // You can add custom handling here if needed
      // For now, the notification will be handled by the system notification handler
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[NOTIFICATION] Notification tapped:', response);

      // Handle notification tap - could navigate to specific screen
      const { notification } = response;
      const data = notification.request.content.data;

      if (data && data.type === 'new_message' && data.senderId) {
        // Could navigate to inbox or detail screen
        console.log('[NOTIFICATION] User tapped notification for sender:', data.senderName);
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  if (isLoading) {
    // We are still checking for a token
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      {authToken ? <MainTabs /> : <LoginScreen />}
    </>
  );
};

function App() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SubscriptionProvider>
          <GroupsProvider>
            <MessagesProvider>
              <NavigationContainer theme={colorScheme === 'dark' ? navigationTheme.dark : navigationTheme.light}>
                <AuthNavigator />
              </NavigationContainer>
            </MessagesProvider>
          </GroupsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

export default App;
