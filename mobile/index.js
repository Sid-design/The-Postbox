/**
 * App entry point.
 *
 * expo-dev-client is imported conditionally — it is only needed in development
 * builds (profile: development, developmentClient: true). Importing it
 * unconditionally in preview/production builds was loading dev-only native
 * modules and replacing the global error handler unnecessarily.
 */
import 'react-native-gesture-handler';

if (__DEV__) {
  require('expo-dev-client');
}

import { registerRootComponent } from 'expo';
import App from './App';

// expo's registerRootComponent always registers under the name "main",
// which matches the moduleName in AppDelegate.swift.
registerRootComponent(App);
