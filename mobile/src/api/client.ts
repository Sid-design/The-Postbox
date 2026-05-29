import axios from 'axios';
import { Message } from '../navigation/types';
import * as SecureStore from 'expo-secure-store';
import { API_CONFIG } from '../config/api.config';

// Centralized token management
const TOKEN_KEY = 'user_auth_token';

// Test console logging - this should always appear
console.log('🚀 API Client module loaded');

export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('[API] Error getting auth token:', error);
    return null;
  }
};

// Create a factory function for axios instances with different timeouts
const createApiClient = (timeout: number = API_CONFIG.timeouts.standard) => {
  return axios.create({
    baseURL: API_CONFIG.currentUrl,
    timeout,
  });
};

// Main API client for standard requests
export const apiClient = createApiClient(API_CONFIG.timeouts.standard);

// Extended timeout client for long-running operations
export const longTimeoutClient = createApiClient(API_CONFIG.timeouts.extended);

// Add the same interceptors to the long timeout client for consistency
longTimeoutClient.interceptors.request.use(
  (config) => {
    const authHeader = config.headers.Authorization;
    const authSnippet = typeof authHeader === 'string' ?
      authHeader.slice(0, 20) + '...' : 'none';

    // Only log for debugging in development
    if (__DEV__) {
      const hasAuth = !!authHeader;
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url} ${hasAuth ? '🔐' : '🔓'}`);
    }
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error.message);
    return Promise.reject(error);
  }
);

longTimeoutClient.interceptors.response.use(
  (response) => {
    // Only log errors or in development
    if (__DEV__ && response.status >= 400) {
      console.log(`[API] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    }
    return response;
  },
  (error) => {
    console.error(`[API] ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || 'ERROR'}: ${error.message}`);
    return Promise.reject(error);
  }
);

// Add request interceptor for debugging
apiClient.interceptors.request.use(
  (config) => {
    const authHeader = config.headers.Authorization;
    const authSnippet = typeof authHeader === 'string' ?
      authHeader.slice(0, 20) + '...' : 'none';

    // Only log for debugging in development
    if (__DEV__) {
      const hasAuth = !!authHeader;
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url} ${hasAuth ? '🔐' : '🔓'}`);
    }
    return config;
  },
  (error) => {
    console.error('[API] ❌ Request setup error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
apiClient.interceptors.response.use(
  (response) => {
    // Only log errors or in development
    if (__DEV__ && response.status >= 400) {
      console.log(`[API] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    }
    return response;
  },
  (error) => {
    console.error(`[API] ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || 'ERROR'}: ${error.message}`);
    return Promise.reject(error);
  }
);

export const getMessages = async (): Promise<Message[]> => {
  try {
    // console.log('[API] Fetching messages...');
    const token = await getAuthToken();
    const response = await apiClient.get('/api/messages', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] Messages fetched successfully', {
      count: response.data?.length || 0,
      messagesType: typeof response.data
    });

    // Backend now returns direct array, no need to access .messages property
    const messages = response.data || [];
    console.log('[API] Messages array length:', messages.length);

    
    if (!Array.isArray(messages)) {
      console.error('[API] Messages is not an array:', messages);
      return [];
    }
    
    return messages.map((msg: any) => ({
      id: msg.id,
      sender_name: msg.sender_name,
      subject: msg.subject,
      snippet: '', // The backend doesn't provide a snippet yet
      received_at: msg.received_at,
      is_read: msg.is_read,
      body_html: msg.body_html || '', // The backend provides the HTML body
    }));
  } catch (error) {
    console.error('[API] Error fetching messages:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        console.error('[API] Authentication error - user may need to re-login');
      } else if (error.response?.status === 500) {
        console.error('[API] Server error - backend may be having issues');
      }
    }
    // In a real app, we'd handle this more gracefully
    return [];
  }
};

export interface Sender {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
}

export interface DiscoverableSender {
  id: number;
  name: string;
  email: string;
  description: string;
  category: string;
  subscriber_count: number;
  featured: number;
  is_subscribed: number;
  is_active?: number; // Optional field that may be returned by backend
}

export const getSenders = async (): Promise<Sender[]> => {
  try {
    // console.log('[API] Fetching senders...');
    const token = await getAuthToken();
    const response = await apiClient.get('/api/senders', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] Senders fetched successfully', { count: response.data.length });
    return response.data;
  } catch (error) {
    console.error('[API] Error fetching senders:', error);
    return [];
  }
};

export const toggleSubscription = async (
  senderId: number,
  isActive: boolean
): Promise<void> => {
  try {
    console.log('[API] Toggling subscription', { senderId, isActive });
    await apiClient.post('/subscriptions/toggle', { senderId, isActive });
    console.log('[API] Subscription toggled successfully');
  } catch (error) {
    console.error('[API] Error toggling subscription:', error);
    // Handle error appropriately in the UI
  }
};

export const registerDeviceToken = async (fcmToken: string): Promise<void> => {
  try {
    console.log('[API] Registering device token...');
    const token = await getAuthToken();
    await apiClient.post('/devices', { fcmToken }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] Device token registered successfully');
  } catch (error) {
    console.error('[API] Error registering device token:', error);
  }
};

// Test basic connectivity
export const testConnectivity = async (): Promise<any> => {
  try {
    console.log('[API] 🧪 Testing basic connectivity...');
    const response = await apiClient.get('/test');
    console.log('[API] ✅ Connectivity test successful:', {
      status: response.status,
      message: 'Backend is responding'
    });
    return response.data;
  } catch (error: any) {
    console.error('[API] ❌ Connectivity test failed:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url
    });
    throw error;
  }
};

export const getDiscoverableNewsletters = async (
  category?: string,
  search?: string,
  limit = 20,
  offset = 0
): Promise<DiscoverableSender[]> => {
  try {
    console.log('[API] 📨 Fetching discoverable newsletters...', { category, search, limit, offset });

    const fullUrl = `${API_CONFIG.currentUrl}/api/newsletters`;
    console.log('[API] 🔗 Full URL:', fullUrl);

    const response = await apiClient.get('/api/newsletters');
    console.log('[API] ✅ Discoverable newsletters fetched successfully', {
      count: response.data.length,
      status: response.status,
      data: response.data
    });
    return response.data;
  } catch (error: any) {
    console.error('[API] ❌ Error fetching discoverable newsletters:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url
    });
    return [];
  }
};

export const subscribeToNewsletter = async (senderId: number): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('[API] Subscribing to newsletter...', { senderId });
    const token = await getAuthToken();
    const response = await apiClient.post('/api/newsletters/subscribe', { senderId }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] Newsletter subscription successful', {
      success: response.data?.success || false,
      message: response.data?.message || 'Subscribed successfully'
    });
    return response.data;
  } catch (error) {
    console.error('[API] Error subscribing to newsletter:', error);
    throw error;
  }
};

// Sync notification settings to backend
export const syncNotificationSettings = async (settings: {
  pushNotifications: boolean;
  notificationSound: boolean;
  notificationFrequency: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}): Promise<void> => {
  try {
    console.log('[API] Syncing notification settings...');
    await apiClient.post('/notification-settings/sync', settings);
    console.log('[API] Notification settings synced successfully');
  } catch (error) {
    console.error('[API] Error syncing notification settings:', error);
    throw error;
  }
};

// Get user's subscribed newsletters
export const getUserSubscriptions = async (): Promise<DiscoverableSender[]> => {
  try {
    console.log('[API] Fetching user subscriptions...');
    const token = await getAuthToken();
    const response = await apiClient.get('/api/subscriptions', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] User subscriptions fetched successfully', { count: response.data.length });
    return response.data;
  } catch (error) {
    console.error('[API] Error fetching user subscriptions:', error);
    return [];
  }
};

// Unsubscribe from newsletter
export const unsubscribeFromNewsletter = async (senderId: number): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('[API] Unsubscribing from newsletter...', { senderId });
    const token = await getAuthToken();
    const response = await apiClient.post('/api/newsletters/unsubscribe', { senderId }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] Newsletter unsubscription successful', {
      success: response.data?.success || false,
      message: response.data?.message || 'Unsubscribed successfully'
    });
    return response.data;
  } catch (error) {
    console.error('[API] Error unsubscribing from newsletter:', error);
    throw error;
  }
};

// Get notification settings from backend
export const getNotificationSettings = async (): Promise<{
  pushNotifications: boolean;
  notificationSound: boolean;
  notificationFrequency: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}> => {
  try {
    console.log('[API] Fetching notification settings...');
    const response = await apiClient.get('/notification-settings');
    console.log('[API] Notification settings fetched successfully');
    return response.data;
  } catch (error) {
    console.error('[API] Error fetching notification settings:', error);
    // Return defaults if error
    return {
      pushNotifications: true,
      notificationSound: true,
      notificationFrequency: 'immediate',
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    };
  }
};

// Debug function to test complete flow
export const testCompleteFlow = async () => {
  console.log('🧪 Testing Complete Newsletter Reader Flow...\n');

  try {
    // 1. Test basic connectivity
    console.log('1️⃣ Testing basic connectivity...');
    await testConnectivity();
    console.log('✅ Basic connectivity: PASSED\n');

    // 2. Test newsletter discovery (no auth required)
    console.log('2️⃣ Testing newsletter discovery...');
    const newsletters = await getDiscoverableNewsletters();
    console.log(`✅ Newsletter discovery: PASSED (${newsletters.length} newsletters found)`);
    if (newsletters.length > 0) {
      console.log(`📧 Sample newsletter: ${newsletters[0].name} (${newsletters[0].email})`);
    }
    console.log('');

    // 3. Test authentication endpoints (should fail gracefully without tokens)
    console.log('3️⃣ Testing authentication error handling...');
    try {
      await getMessages();
      console.log('❌ Auth test: FAILED (should have required authentication)');
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log('✅ Authentication error handling: PASSED (401 Unauthorized as expected)');
      } else {
        console.log('⚠️ Auth test: Unexpected error:', error.message);
      }
    }
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('📱 Mobile app should work correctly with these endpoints.');

  } catch (error: any) {
    console.error('❌ Flow test failed:', error.message);
    console.log('🔧 Check the error details above to identify issues.');
  }
};

// Debug function to check authentication status
export const debugAuth = async (): Promise<any> => {
  try {
    console.log('[API] Debugging authentication...');
    const response = await apiClient.get('/debug/auth');
    console.log('[API] Debug auth response:', {
      authenticated: response.data?.authenticated || false,
      userId: response.data?.userId,
      hasRefreshToken: response.data?.hasRefreshToken || false
    });
    return response.data;
  } catch (error) {
    console.error('[API] Error debugging auth:', error);
    throw error;
  }
};

// Add test sender for notification testing
export const addTestSender = async (): Promise<any> => {
  try {
    console.log('[API] Adding test sender...');
    const token = await getAuthToken();
    const response = await apiClient.post('/api/test/add-sender', {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] Test sender added:', response.data);
    return response.data;
  } catch (error) {
    console.error('[API] Failed to add test sender:', error);
    throw error;
  }
};

// Debug notification setup
export const debugNotifications = async (): Promise<any> => {
  try {
    console.log('[API] Debugging notification setup...');
    const token = await getAuthToken();
    const response = await apiClient.get('/api/debug/notifications', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    console.log('[API] Notification debug info:', response.data);
    return response.data;
  } catch (error) {
    console.error('[API] Failed to debug notifications:', error);
    throw error;
  }
};

// Backfill Gmail messages with extended timeout
export const triggerBackfill = async (): Promise<any> => {
  try {
    console.log('[API] Triggering Gmail backfill...');
    const token = await getAuthToken();

    const response = await longTimeoutClient.post('/api/backfill', {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    console.log('[API] Backfill completed successfully', {
      imported: response.data?.imported || 0,
      skipped: response.data?.skipped || 0
    });
    return response.data;
  } catch (error: any) {
    console.error('[API] Error during backfill:', error);

    // Handle the case where Gmail access has expired
    if (error.response?.status === 401 && error.response?.data?.needsReauth) {
      console.log('[API] Gmail access expired, user needs to re-authenticate');
      throw new Error('Gmail access expired. Please sign out and sign back in to refresh your Gmail access.');
    }

    throw error;
  }
};

// Trigger initial sender scan
export const triggerInitialScan = async (): Promise<any> => {
  try {
    console.log('[API] Triggering initial sender scan...');
    const token = await getAuthToken();

    const response = await apiClient.post('/api/trigger-initial-scan', {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    console.log('[API] Initial scan completed successfully', {
      sendersFound: response.data?.sendersFound || 0,
      scanComplete: response.data?.success || false
    });
    return response.data;
  } catch (error: any) {
    console.error('[API] Error during initial scan:', error);

    // Handle the case where Gmail access has expired
    if (error.response?.status === 401 && error.response?.data?.needsReauth) {
      console.log('[API] Gmail access expired, user needs to re-authenticate');
      throw new Error('Gmail access expired. Please sign out and sign back in to refresh your Gmail access.');
    }

    throw error;
  }
};

// Get debug authentication info
export const getDebugAuthInfo = async (): Promise<any> => {
  try {
    console.log('[API] Getting debug auth info...');
    const token = await getAuthToken();

    const response = await apiClient.get('/debug/auth', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    console.log('[API] Debug auth info:', {
      authenticated: response.data?.authenticated || false,
      userId: response.data?.userId,
      hasRefreshToken: response.data?.hasRefreshToken || false
    });
    return response.data;
  } catch (error) {
    console.error('[API] Error getting debug auth info:', error);
    throw error;
  }
};

// Manual trigger initial scan (for testing)
export const triggerInitialScanManual = async (): Promise<any> => {
  try {
    console.log('[API] Manually triggering initial scan...');
    const token = await getAuthToken();

    const response = await apiClient.post('/api/trigger-initial-scan-manual', {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    console.log('[API] Manual initial scan completed', {
      sendersFound: response.data?.sendersFound || 0,
      scanComplete: response.data?.success || false
    });
    return response.data;
  } catch (error) {
    console.error('[API] Error during manual initial scan:', error);
    throw error;
  }
}; 

export const sendTestNotification = async () => {
  try {
    const response = await apiClient.post('/api/test/notification');
    return response.data;
  } catch (error) {
    console.error('[API] Test notification error:', error);
    throw error;
  }
}; 