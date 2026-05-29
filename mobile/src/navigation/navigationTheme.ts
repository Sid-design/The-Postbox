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
}; 