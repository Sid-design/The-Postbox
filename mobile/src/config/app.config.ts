import Constants from 'expo-constants';
import { API_CONFIG } from './api.config';

// Get app variant from build-time environment variables
const APP_VARIANT = Constants.expoConfig?.extra?.APP_VARIANT || 
                   process.env.EXPO_PUBLIC_APP_VARIANT || 
                   'development';

const APP_NAME = Constants.expoConfig?.extra?.APP_NAME || 
                process.env.EXPO_PUBLIC_APP_NAME || 
                'The Postbox (Dev)';

// Configuration based on build variant
export const AppConfig = {
  // App identity
  appName: APP_NAME,
  appVariant: APP_VARIANT,
  isDevelopment: APP_VARIANT === 'development',
  isProduction: APP_VARIANT === 'production',
  
  // Bundle identifiers (read-only, set by EAS)
  bundleId: APP_VARIANT === 'production' ? 'io.thepostbox.app' : 'io.thepostbox.dev',
  
  // API Configuration - centralized from api.config.ts
  apiUrl: API_CONFIG.currentUrl,
  
  // OAuth Configuration (same for both)
  oauth: {
    iosClientId: '493373719535-v990sc2u46lgga6nkbt962isqr7518ni.apps.googleusercontent.com',
    webClientId: '493373719535-68sbv92kmtnvujjclqja8bkt6kc0i8bs.apps.googleusercontent.com',
    redirectUri: 'com.googleusercontent.apps.493373719535-v990sc2u46lgga6nkbt962isqr7518ni:/oauth2redirect',
  },
  
  // App-specific settings
  settings: {
    // Show debug info in development
    showDebugInfo: APP_VARIANT === 'development',
    
    // Different app icons or themes could be configured here
    theme: APP_VARIANT === 'development' ? 'dev' : 'production',
    
    // Enable additional logging in development
    enableDetailedLogging: APP_VARIANT === 'development',
  }
};

// Export individual values for convenience
export const { appName, appVariant, isDevelopment, isProduction, bundleId, apiUrl, oauth, settings } = AppConfig;

// Debug logging
if (__DEV__) {
  console.log('🔧 App Configuration:', {
    appName,
    appVariant,
    bundleId,
    isDevelopment,
    isProduction
  });
}

