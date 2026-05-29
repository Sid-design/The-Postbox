import React, { useState, useRef, useEffect } from 'react';
import { ActivityIndicator, Text, View, TouchableOpacity, StyleSheet, useColorScheme, Animated } from 'react-native';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { apiClient } from '../api/client';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const auth = useAuth();
  const colorScheme = useColorScheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buttonPressed, setButtonPressed] = useState(false);

  const themeColors = colorScheme === 'dark' ? colors.dark : colors.light;

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade in animation on mount
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(logoScaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleButtonPressIn = () => {
    setButtonPressed(true);
    Animated.spring(buttonScaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handleButtonPressOut = () => {
    setButtonPressed(false);
    Animated.spring(buttonScaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: '493373719535-v990sc2u46lgga6nkbt962isqr7518ni.apps.googleusercontent.com',
    webClientId: '493373719535-68sbv92kmtnvujjclqja8bkt6kc0i8bs.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    redirectUri: 'com.googleusercontent.apps.493373719535-v990sc2u46lgga6nkbt962isqr7518ni:/oauth2redirect', // iOS redirect URI
    // PKCE (Proof Key for Code Exchange) - Security best practice for mobile OAuth2
    // Prevents authorization code interception attacks on public clients
    usePKCE: true,
    extraParams: {
      access_type: 'offline',
      prompt: 'consent', // Force consent screen to get refresh token
      include_granted_scopes: 'true',
    },
  });

  React.useEffect(() => {
    const handleResponse = async () => {
      if (response?.type === 'success') {
        setIsLoading(true);
        setError(null);

        const authCode = response.params.code;
        const codeVerifier = request?.codeVerifier;

        try {
          // For mobile PKCE flow, use the tokens we already have from the OAuth response
          const { id_token, access_token, refresh_token } = response.params;

          console.log('[MOBILE_LOGIN] Full OAuth response:', {
            type: response.type,
            params: {
              ...response.params,
              id_token: id_token ? `${id_token.substring(0, 20)}...` : null,
              access_token: access_token ? `${access_token.substring(0, 20)}...` : null,
              refresh_token: refresh_token ? `${refresh_token.substring(0, 20)}...` : null,
            },
            hasIdToken: !!id_token,
            hasAccessToken: !!access_token,
            hasRefreshToken: !!refresh_token,
            authCodeLength: authCode?.length || 0
          });

          // Exchange Google ID token for our app's JWT and trigger scan
          // Note: Not passing authCode since Expo already used it internally
          const loginResponse = await apiClient.post('/login', {
            idToken: id_token,
            accessToken: access_token,
            refreshToken: refresh_token, // Pass refresh token directly from mobile OAuth (may be null)
            // authCode: authCode, // Don't pass - already used by Expo
          });

          const { token, refreshToken: appRefreshToken, expiresIn } = loginResponse.data;
          if (token) {
            await auth.login(token, appRefreshToken, expiresIn);

            // Log the authentication result for debugging
            console.log('[LOGIN_SUCCESS] Authentication completed:', {
              hasToken: !!token,
              hasAppRefreshToken: !!appRefreshToken,
              hasMobileRefreshToken: !!refresh_token,
              expiresIn
            });
          }
        } catch (error) {
          console.error('Login failed:', error);
          setError('Failed to sign in. Please try again.');
          setIsLoading(false);
        }
      } else if (response?.type === 'error') {
        console.error('OAuth Error Details:', {
          error: response.error,
          error_description: response.params?.error_description,
          fullResponse: response
        });
        setError(`Authentication failed: ${response.params?.error_description || 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    handleResponse();
  }, [response]);

  const handleGoogleSignIn = async () => {
    if (!request) return;

    setIsLoading(true);
    setError(null);

    try {
      // Start the OAuth flow - the prompt will handle any existing sessions
      await promptAsync();
    } catch (err) {
      console.error('Google sign-in prompt failed:', err);
      setError('Failed to start sign-in process. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { backgroundColor: themeColors.background, opacity: fadeAnim }]}>
      {/* Logo Section */}
      <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScaleAnim }] }]}>
        <View style={[styles.logoPlaceholder, { backgroundColor: themeColors.primary }]}>
          <Ionicons name="mail" size={48} color="#FFFFFF" />
        </View>
        <Text style={[styles.appTitle, { color: themeColors.textPrimary }]}>
          The Postbox
        </Text>
        <Text style={[styles.appSubtitle, { color: themeColors.textSecondary }]}>
          Your newsletter companion
        </Text>
      </Animated.View>

      {/* Sign In Section */}
      <View style={styles.signInContainer}>
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#DC2626" style={styles.errorIcon} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
          <TouchableOpacity
            style={[styles.googleButton, {
              backgroundColor: isLoading ? '#E5E7EB' : '#FFFFFF',
              borderColor: buttonPressed ? '#4285F4' : '#DADCE0'
            }]}
            onPress={handleGoogleSignIn}
            onPressIn={handleButtonPressIn}
            onPressOut={handleButtonPressOut}
            disabled={isLoading || !request}
            accessibilityLabel="Sign in with Google"
            accessibilityRole="button"
            activeOpacity={0.8}
          >
          <View style={styles.googleButtonContent}>
            {isLoading ? (
              <View style={styles.iconContainer}>
                <ActivityIndicator size="small" color={themeColors.primary} />
              </View>
            ) : (
              <View style={styles.iconContainer}>
                <Ionicons name="logo-google" size={20} color="#4285F4" />
              </View>
            )}
            <Text style={[styles.googleButtonText, { color: isLoading ? themeColors.textSecondary : '#3C4043' }]}>
              {isLoading ? 'Signing in...' : 'Sign in with Google'}
            </Text>
          </View>
          </TouchableOpacity>
        </Animated.View>

        <Text style={[styles.privacyText, { color: themeColors.textSecondary }]}>
          By signing in, you agree to our terms of service and privacy policy
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.8,
  },
  signInContainer: {
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    width: '100%',
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    flex: 1,
  },
  googleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#DADCE0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 16,
    marginRight: 20,
    fontWeight: '600',
  },
  privacyText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.7,
  },
}); 