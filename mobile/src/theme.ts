export const colors = {
  light: {
    primary: '#4A90E2', // Royal Blue
    background: '#F4F6F8', // Light Gray
    surface: '#FFFFFF', // White
    textPrimary: '#1A202C', // Charcoal
    textSecondary: '#718096', // Slate Gray
  },
  dark: {
    primary: '#4A90E2', // Royal Blue
    background: '#1A202C', // Dark Charcoal
    surface: '#2D3748', // Dark Gray
    textPrimary: '#E2E8F0', // Off-White
    textSecondary: '#A0AEC0', // Light Slate
  },
  sepia: {
    primary: '#4A90E2', // Royal Blue (brand accent kept across all themes)
    background: '#F1E7CF', // Warm paper
    surface: '#FAF3E0', // Warm card
    textPrimary: '#5B4636', // Warm dark brown
    textSecondary: '#8A7866', // Muted brown
  },
};

export type ThemeName = keyof typeof colors; // 'light' | 'dark' | 'sepia'

export const theme = {
  light: {
    ...colors.light,
  },
  dark: {
    ...colors.dark,
  },
  sepia: {
    ...colors.sepia,
  },
}; 