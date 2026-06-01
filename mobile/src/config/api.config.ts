export const API_CONFIG = {
  // Set via EXPO_PUBLIC_API_URL in eas.json per build profile.
  // Falls back to localhost for running the Metro dev server locally.
  currentUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',

  timeouts: {
    standard: 10000,
    extended: 60000,
  },
};

