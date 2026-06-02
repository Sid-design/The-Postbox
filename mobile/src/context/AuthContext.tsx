import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { Alert } from 'react-native';
import { apiClient, longTimeoutClient } from '../api/client';

// JWT token decoder utility
const decodeJWT = (token: string): any => {
  try {
    const base64Payload = token.split('.')[1];
    const payload = JSON.parse(atob(base64Payload));
    return payload;
  } catch (error) {
    console.warn('Failed to decode JWT token:', error);
    return null;
  }
};

interface AuthContextType {
  authToken: string | null;
  isFirstLogin: boolean;
  isLoading: boolean;
  consumeFirstLogin: () => void;
  login: (token: string, refreshToken?: string, expiresInSeconds?: number) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'user_auth_token';
const REFRESH_TOKEN_KEY = 'user_refresh_token';

// E2E test mode: when built with EXPO_PUBLIC_E2E=1 (CI only — never production),
// the app skips the Google login screen by seeding a stub in-memory token so
// Maestro can reach and screenshot the logged-in screens. The stub is never
// written to SecureStore, and the response interceptor below short-circuits all
// token-refresh / recovery dialogs in this mode so API 401s don't block the UI.
const IS_E2E = process.env.EXPO_PUBLIC_E2E === '1';
const E2E_STUB_TOKEN = 'e2e-stub-token';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const consumeFirstLogin = () => {
    setIsFirstLogin(false);
  };

  useEffect(() => {
    const loadToken = async () => {
      try {
        const [token, storedRefreshToken] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
        ]);
        if (token) {
          setAuthToken(token);
        } else if (IS_E2E) {
          // No real session, but E2E build → drop straight into the app.
          setAuthToken(E2E_STUB_TOKEN);
        }
        // Keep refresh token available in storage; we read it when needed
      } catch (e) {
        console.error('Failed to load auth token', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadToken();
  }, []);

  const login = async (token: string, refreshToken?: string, expiresInSeconds?: number) => {
    try {
      // A simple way to check if this is the first ever login on this device.
      // If a token already exists, it's not the first login.
      const existingToken = await SecureStore.getItemAsync(TOKEN_KEY);
      setIsFirstLogin(!existingToken);

      await SecureStore.setItemAsync(TOKEN_KEY, token);
      if (refreshToken) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
      }
      setAuthToken(token);
    } catch (e) {
      console.error('Failed to save auth token', e);
    }
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      setAuthToken(null);
      setIsFirstLogin(false); // Reset on logout
    } catch (e) {
      console.error('Failed to delete auth token', e);
    }
  };

  // Proactive token health monitoring
  const checkTokenHealth = async (): Promise<boolean> => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return false;

      const decoded = decodeJWT(token);
      if (!decoded) return false;

      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - currentTime;

      // Refresh if token expires within 30 minutes
      if (timeUntilExpiry < 30 * 60) {
        console.log('[AUTH] Token expiring soon, refreshing proactively');
        return await refreshTokenProactively();
      }

      return true;
    } catch (error) {
      console.warn('Token health check failed:', error);
      return false;
    }
  };

  // Proactive token refresh
  const refreshTokenProactively = async (): Promise<boolean> => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        console.log('[AUTH] No refresh token available for proactive refresh');
        return false;
      }

      const response = await longTimeoutClient.post('/auth/refresh', { refreshToken });
      const { accessToken: newAccessToken } = response.data || {};

      if (newAccessToken) {
        await SecureStore.setItemAsync(TOKEN_KEY, newAccessToken);
        setAuthToken(newAccessToken);
        console.log('[AUTH] Token refreshed proactively');
        return true;
      }

      return false;
    } catch (error) {
      console.warn('Proactive token refresh failed:', error);
      return false;
    }
  };

  // Enhanced error recovery with user-friendly dialog
  const showAuthRecoveryDialog = (): Promise<'retry' | 'logout'> => {
    return new Promise((resolve) => {
      Alert.alert(
        "Connection Issue",
        "Your session has expired or there's a connection problem. What would you like to do?",
        [
          {
            text: "Try Again",
            onPress: () => resolve('retry'),
            style: "default"
          },
          {
            text: "Sign Out",
            onPress: () => resolve('logout'),
            style: "destructive"
          }
        ]
      );
    });
  };

  // Gmail token validation
  const validateGmailToken = async (): Promise<boolean> => {
    try {
      // Try to call the Gmail refresh endpoint to check if token is valid
      const response = await apiClient.post('/auth/refresh-gmail');
      return response.data?.success === true;
    } catch (error) {
      console.warn('[AUTH] Gmail token validation failed:', error);
      return false;
    }
  };

  // Gmail token refresh
  const refreshGmailToken = async (): Promise<boolean> => {
    try {
      const response = await apiClient.post('/auth/refresh-gmail');
      if (response.data?.success) {
        console.log('[AUTH] Gmail token refreshed successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[AUTH] Gmail token refresh failed:', error);
      return false;
    }
  };

  // Enhanced retry mechanism
  const attemptRecovery = async (): Promise<boolean> => {
    try {
      // First try proactive token refresh
      const tokenRefreshed = await refreshTokenProactively();
      if (tokenRefreshed) {
        console.log('[AUTH] Recovery successful via token refresh');
        return true;
      }

      // Try Gmail token refresh if this is a Gmail-related operation
      const gmailRefreshed = await refreshGmailToken();
      if (gmailRefreshed) {
        console.log('[AUTH] Recovery successful via Gmail token refresh');
        return true;
      }

      // If token refresh failed, prompt user for choice
      const userChoice = await showAuthRecoveryDialog();

      if (userChoice === 'logout') {
        await logout();
        return false;
      }

      // User chose to retry, attempt refresh again
      const retryRefresh = await refreshTokenProactively();
      const retryGmailRefresh = await refreshGmailToken();

      if (retryRefresh || retryGmailRefresh) {
        console.log('[AUTH] Recovery successful on retry');
        return true;
      }

      // If still failed, show dialog again
      await showAuthRecoveryDialog();
      return false;
    } catch (error) {
      console.error('[AUTH] Recovery attempt failed:', error);
      await showAuthRecoveryDialog();
      return false;
    }
  };

  // Enhanced token refresh system with Gmail token support
  useEffect(() => {
    let isRefreshing = false;
    let pendingRequests: Array<(token: string | null) => void> = [];

    const processQueue = (newToken: string | null) => {
      pendingRequests.forEach(cb => cb(newToken));
      pendingRequests = [];
    };

    const interceptorId = apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // E2E builds use a stub token that the backend rejects; never attempt
        // refresh or surface the recovery dialog — just let calls fail quietly so
        // screens render their empty/error states for screenshots.
        if (IS_E2E) {
          return Promise.reject(error);
        }

        // Handle 401/403 errors with enhanced token refresh
        if ((status === 401 || status === 403) && !originalRequest._retry) {
          originalRequest._retry = true;

          if (isRefreshing) {
            // Queue this request until refresh completes
            return new Promise((resolve, reject) => {
              pendingRequests.push((newToken) => {
                if (newToken) {
                  originalRequest.headers = {
                    ...(originalRequest.headers || {}),
                    Authorization: `Bearer ${newToken}`,
                  };
                  resolve(apiClient(originalRequest));
                } else {
                  reject(error);
                }
              });
            });
          }

          isRefreshing = true;

          try {
            // First try JWT refresh
            const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            if (refreshToken) {
              const refreshResponse = await longTimeoutClient.post(
                '/auth/refresh',
                { refreshToken }
              );
              const { accessToken: newAccessToken } = refreshResponse.data || {};

              if (newAccessToken) {
                await SecureStore.setItemAsync(TOKEN_KEY, newAccessToken);
                setAuthToken(newAccessToken);
                processQueue(newAccessToken);

                // Retry the original request
                originalRequest.headers = {
                  ...(originalRequest.headers || {}),
                  Authorization: `Bearer ${newAccessToken}`,
                };
                return apiClient(originalRequest);
              }
            }

            // If JWT refresh failed, try Gmail token refresh for backfill requests
            if (originalRequest.url?.includes('/backfill')) {
              try {
                const gmailRefreshResponse = await apiClient.post('/auth/refresh-gmail');
                if (gmailRefreshResponse.data.success) {
                  // Gmail token refreshed, retry the backfill request
                  return apiClient(originalRequest);
                }
              } catch (gmailRefreshError) {
                console.warn('Gmail token refresh failed:', gmailRefreshError instanceof Error ? gmailRefreshError.message : 'Unknown error');
              }
            }

            // If all refresh attempts failed, attempt recovery instead of immediate logout
            console.log('[AUTH] All refresh attempts failed, attempting recovery');
            try {
              const recoverySuccess = await attemptRecovery();
              if (recoverySuccess) {
                // Recovery successful, retry the original request
                originalRequest.headers = {
                  ...(originalRequest.headers || {}),
                  Authorization: `Bearer ${authToken}`,
                };
                return apiClient(originalRequest);
              } else {
                // Recovery failed, reject the request
                processQueue(null);
                return Promise.reject(error);
              }
            } catch (recoveryError) {
              console.error('[AUTH] Recovery failed:', recoveryError);
              processQueue(null);
              return Promise.reject(error);
            }

          } catch (e) {
            console.error('Token refresh failed:', e);
            // Try recovery instead of immediate logout
            try {
              const recoverySuccess = await attemptRecovery();
              if (recoverySuccess) {
                // Recovery successful, retry the original request
                originalRequest.headers = {
                  ...(originalRequest.headers || {}),
                  Authorization: `Bearer ${authToken}`,
                };
                return apiClient(originalRequest);
              } else {
                // Recovery failed, reject the request
                processQueue(null);
                return Promise.reject(e);
              }
            } catch (recoveryError) {
              console.error('[AUTH] Recovery failed:', recoveryError);
              processQueue(null);
              return Promise.reject(e);
            }
          } finally {
            isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      apiClient.interceptors.response.eject(interceptorId);
    };
  }, [logout]);

  // Proactive token health monitoring - check every 15 minutes
  useEffect(() => {
    const healthCheckInterval = setInterval(() => {
      if (authToken) {
        checkTokenHealth().catch(console.warn);
        // Also check Gmail token health
        validateGmailToken().catch(console.warn);
      }
    }, 15 * 60 * 1000); // 15 minutes

    return () => {
      clearInterval(healthCheckInterval);
    };
  }, [authToken]);

  return (
    <AuthContext.Provider value={{ authToken, isFirstLogin, isLoading, login, logout, consumeFirstLogin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 