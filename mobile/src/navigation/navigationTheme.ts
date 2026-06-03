import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { colors } from '../theme';

export const navigationTheme = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.light.primary,
      background: colors.light.background,
      card: colors.light.surface,
      text: colors.light.textPrimary,
      border: colors.light.background,
      notification: colors.light.primary,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: colors.dark.primary,
      background: colors.dark.background,
      card: colors.dark.surface,
      text: colors.dark.textPrimary,
      border: colors.dark.background,
      notification: colors.dark.primary,
    },
  },
  // Sepia uses the light theme structure (it's a warm light theme), with the
  // sepia palette. `dark: false` so RN renders light-appropriate native bits.
  sepia: {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.sepia.primary,
      background: colors.sepia.background,
      card: colors.sepia.surface,
      text: colors.sepia.textPrimary,
      border: colors.sepia.background,
      notification: colors.sepia.primary,
    },
  },
}; 