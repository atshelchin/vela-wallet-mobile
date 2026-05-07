/**
 * Text scale system — 6 levels from compact to xlarge.
 *
 * iOS defaults to 'standard', Android defaults to 'comfortable'.
 * Changes take effect immediately via TextScaleProvider context.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'vela.textScale';

export type TextScaleLevel = 'compact' | 'small' | 'standard' | 'comfortable' | 'large' | 'xlarge';

export const TEXT_SCALE_LEVELS: { key: TextScaleLevel; label: string; factor: number }[] = [
  { key: 'compact',     label: 'Compact',     factor: 0.85 },
  { key: 'small',       label: 'Small',       factor: 0.92 },
  { key: 'standard',    label: 'Standard',    factor: 1.0  },
  { key: 'comfortable', label: 'Comfortable', factor: 1.08 },
  { key: 'large',       label: 'Large',       factor: 1.17 },
  { key: 'xlarge',      label: 'Extra Large', factor: 1.28 },
];

const DEFAULT_LEVEL: TextScaleLevel = Platform.OS === 'android' ? 'comfortable' : 'standard';

// ---------------------------------------------------------------------------
// Synchronous module-level cache (for initial StyleSheet.create)
// ---------------------------------------------------------------------------

let _currentLevel: TextScaleLevel = DEFAULT_LEVEL;
let _currentFactor: number = TEXT_SCALE_LEVELS.find(l => l.key === DEFAULT_LEVEL)!.factor;

export function getTextScaleFactor(): number {
  return _currentFactor;
}

export function getTextScaleLevel(): TextScaleLevel {
  return _currentLevel;
}

/** Load from storage — call once at app startup before rendering. */
export async function loadTextScale(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const match = TEXT_SCALE_LEVELS.find(l => l.key === stored);
      if (match) {
        _currentLevel = match.key;
        _currentFactor = match.factor;
      }
    }
  } catch {
    // Use default
  }
}

// ---------------------------------------------------------------------------
// React Context — drives instant re-renders on scale change
// ---------------------------------------------------------------------------

interface TextScaleContextValue {
  /** Current version counter — increment to force tree rebuild */
  version: number;
  level: TextScaleLevel;
  levelIndex: number;
  change: (delta: number) => void;
}

const TextScaleContext = createContext<TextScaleContextValue>({
  version: 0,
  level: DEFAULT_LEVEL,
  levelIndex: TEXT_SCALE_LEVELS.findIndex(l => l.key === DEFAULT_LEVEL),
  change: () => {},
});

export function useTextScale() {
  return useContext(TextScaleContext);
}

/**
 * Provider that manages text scale state.
 * Wrap around the app root. When scale changes, `version` increments —
 * use it as a `key` on the child tree to force full rebuild with new text values.
 */
export function TextScaleProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const [levelIndex, setLevelIndex] = useState(
    () => TEXT_SCALE_LEVELS.findIndex(l => l.key === _currentLevel),
  );

  const change = useCallback(async (delta: number) => {
    const next = levelIndex + delta;
    if (next < 0 || next >= TEXT_SCALE_LEVELS.length) return;

    const level = TEXT_SCALE_LEVELS[next];
    _currentLevel = level.key;
    _currentFactor = level.factor;
    await AsyncStorage.setItem(STORAGE_KEY, level.key).catch(() => {});

    // Mutate the text token object so new StyleSheet.create picks up new values
    const { rebuildTextScale } = require('./theme');
    rebuildTextScale();

    setLevelIndex(next);
    // Increment version to force tree rebuild via key change
    setVersion(v => v + 1);
  }, [levelIndex]);

  const value = useMemo(() => ({
    version,
    level: TEXT_SCALE_LEVELS[levelIndex].key,
    levelIndex,
    change,
  }), [version, levelIndex, change]);

  return React.createElement(TextScaleContext.Provider, { value }, children);
}
