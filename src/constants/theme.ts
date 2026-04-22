import { Platform } from 'react-native';

// MARK: - Vela Colors (matches iOS VelaTheme.swift)

export const VelaColor = {
  bg: '#FAFAF8',
  bgCard: '#FFFFFF',
  bgWarm: '#F5F3EF',

  textPrimary: '#1A1A18',
  textSecondary: '#7A776E',
  textTertiary: '#B0ADA5',

  accent: '#E8572A',
  accentSoft: '#FFF0EB',

  green: '#2D8E5F',
  greenSoft: '#EDFAF2',

  blue: '#4267F4',
  blueSoft: '#EDF0FF',

  border: '#ECEBE4',

  // Token icon backgrounds
  ethBg: '#EEF0F8',
  usdcBg: '#EDF7F0',
  daiBg: '#FFF8E7',

  // Network icon backgrounds
  arbBg: '#E8F4FD',
  baseBg: '#E8EEFF',
  opBg: '#FFECEC',
} as const;

// MARK: - Typography

export const VelaFont = {
  heading: (size: number) => ({
    fontSize: size,
    fontWeight: '700' as const,
  }),
  title: (size: number) => ({
    fontSize: size,
    fontWeight: '600' as const,
  }),
  body: (size: number) => ({
    fontSize: size,
    fontWeight: '400' as const,
  }),
  label: (size: number) => ({
    fontSize: size,
    fontWeight: '600' as const,
  }),
  mono: (size: number) => ({
    fontSize: size,
    fontWeight: '500' as const,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  }),
  caption: () => ({
    fontSize: 12,
    fontWeight: '500' as const,
  }),
};

// MARK: - Spacing & Radius

export const VelaRadius = {
  card: 16,
  cardSmall: 10,
  full: 9999,
  button: 16,
} as const;

export const VelaSpacing = {
  screenH: 24,
  cardPadding: 20,
  itemGap: 14,
} as const;

// Legacy exports for compatibility with existing template components
export const Colors = {
  light: {
    text: VelaColor.textPrimary,
    background: VelaColor.bg,
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: VelaColor.textSecondary,
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
