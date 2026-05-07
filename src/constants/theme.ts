import { Platform, StyleSheet as RNStyleSheet } from 'react-native';
import { getTextScaleFactor } from './text-scale';

// =============================================================================
// Design Tokens — single source of truth
//
// Naming follows Simple Design conventions:
//   Spacing:    space.xs … space.3xl  (4px base)
//   Typography: text.xs … text.3xl    (size, scaled) + weight.regular … weight.bold
//   Radius:     radius.sm … radius.full
//   Colors:     fg (foreground hierarchy), bg (background layers), accent, semantic
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Spacing (4px base grid)
// ---------------------------------------------------------------------------

export const space = {
  '0':   0,
  'xs':  2,
  'sm':  4,
  'md':  8,
  'lg':  12,
  'xl':  16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
  '5xl': 48,
} as const;

// ---------------------------------------------------------------------------
// 2. Typography — sizes (scaled by user preference), weights, line-heights
// ---------------------------------------------------------------------------

// Base sizes before scaling
const TEXT_BASE = {
  'xs':  9,
  'sm':  10,
  'base': 12,
  'lg':  14,
  'xl':  16,
  '2xl': 18,
  '3xl': 24,
  '4xl': 28,
};

type TextKey = keyof typeof TEXT_BASE;
const TEXT_KEYS = Object.keys(TEXT_BASE) as TextKey[];

function buildTextScale(): Record<TextKey, number> {
  const s = getTextScaleFactor();
  const result = {} as Record<TextKey, number>;
  for (const key of TEXT_KEYS) {
    result[key] = Math.round(TEXT_BASE[key] * s);
  }
  return result;
}

/** Scaled text sizes — multiply base × user scale factor (loaded at app start) */
export const text = buildTextScale();

/** Style version — increments when text scale changes, invalidating createStyles caches. */
let _styleVersion = 0;
export function getStyleVersion() { return _styleVersion; }

/** Rebuild text scale values. Call after loadTextScale() or when user changes scale. */
export function rebuildTextScale(): void {
  const s = getTextScaleFactor();
  for (const key of TEXT_KEYS) {
    text[key] = Math.round(TEXT_BASE[key] * s);
  }
  _styleVersion++;
}

/**
 * Drop-in replacement for StyleSheet.create that re-evaluates when text scale changes.
 *
 * Usage: replace `const styles = StyleSheet.create({...})`
 *   with: `const styles = createStyles(() => ({...}))`
 *
 * Component code stays the same — `styles.title` works as before.
 */
export function createStyles<T extends RNStyleSheet.NamedStyles<T>>(
  factory: () => T | RNStyleSheet.NamedStyles<T>,
): T {
  let cache: T | null = null;
  let ver = -1;

  return new Proxy({} as T, {
    get(_, prop: string | symbol) {
      if (cache === null || ver !== _styleVersion) {
        cache = RNStyleSheet.create(factory() as T);
        ver = _styleVersion;
      }
      return (cache as any)[prop];
    },
  });
}

export const leading = {
  'none':   1,
  'tight':  1.2,
  'normal': 1.4,
  'relaxed': 1.6,
} as const;

export const weight = {
  'regular': '400' as const,
  'medium':  '500' as const,
  'semibold': '600' as const,
  'bold':    '700' as const,
};

export const font = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

// ---------------------------------------------------------------------------
// 3. Border Radius
// ---------------------------------------------------------------------------

export const radius = {
  'none': 0,
  'sm':   4,
  'md':   8,
  'lg':   12,
  'xl':   16,
  '2xl':  20,
  'full': 9999,
} as const;

// ---------------------------------------------------------------------------
// 4. Colors — keep Vela palette, organize semantically
// ---------------------------------------------------------------------------

export const color = {
  // Foreground hierarchy
  fg: {
    base:   '#1A1A18',   // primary text, icons
    muted:  '#7A776E',   // secondary text
    subtle: '#B0ADA5',   // tertiary text, placeholders
    inverse: '#FFFFFF',  // text on dark/accent bg
  },

  // Background layers
  bg: {
    base:    '#FAFAF8',  // page background
    raised:  '#FFFFFF',  // cards, inputs
    sunken:  '#F5F3EF',  // inset areas, warm backgrounds
  },

  // Brand accent
  accent: {
    base:  '#E8572A',
    soft:  '#FFF0EB',
  },

  // Semantic
  success: {
    base: '#2D8E5F',
    soft: '#EDFAF2',
  },
  info: {
    base: '#4267F4',
    soft: '#EDF0FF',
  },

  // Borders & dividers
  border: {
    base:   '#ECEBE4',
    strong: '#D8D6CE',
  },
} as const;

// Legacy exports for template components
export const Colors = {
  light: {
    text: color.fg.base,
    background: color.bg.base,
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: color.fg.muted,
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
