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
  { key: 'compact',     label: 'Compact',     factor: 0.82 },
  { key: 'small',       label: 'Small',       factor: 0.91 },
  { key: 'standard',    label: 'Standard',    factor: 1.0  },
  { key: 'comfortable', label: 'Comfortable', factor: 1.10 },
  { key: 'large',       label: 'Large',       factor: 1.22 },
  { key: 'xlarge',      label: 'Extra Large', factor: 1.35 },
];

// Same default on both platforms — Inter renders identically everywhere
const DEFAULT_LEVEL: TextScaleLevel = 'standard';

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
  /** Jump directly to a level index (for slider). */
  setIndex: (index: number) => void;
}

const TextScaleContext = createContext<TextScaleContextValue>({
  version: 0,
  level: DEFAULT_LEVEL,
  levelIndex: TEXT_SCALE_LEVELS.findIndex(l => l.key === DEFAULT_LEVEL),
  change: () => {},
  setIndex: () => {},
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

  const change = useCallback((delta: number) => {
    const next = levelIndex + delta;
    if (next < 0 || next >= TEXT_SCALE_LEVELS.length) return;

    const level = TEXT_SCALE_LEVELS[next];
    _currentLevel = level.key;
    _currentFactor = level.factor;

    // 1. Rebuild text tokens synchronously FIRST
    const { rebuildTextScale } = require('./theme');
    rebuildTextScale();

    // 2. Trigger re-render synchronously (React batches these)
    setLevelIndex(next);
    setVersion(v => v + 1);

    // 3. Persist in background — never block the UI
    AsyncStorage.setItem(STORAGE_KEY, level.key).catch(() => {});
  }, [levelIndex]);

  const setIndex = useCallback((index: number) => {
    if (index < 0 || index >= TEXT_SCALE_LEVELS.length || index === levelIndex) return;
    const level = TEXT_SCALE_LEVELS[index];
    _currentLevel = level.key;
    _currentFactor = level.factor;
    const { rebuildTextScale } = require('./theme');
    rebuildTextScale();
    setLevelIndex(index);
    setVersion(v => v + 1);
    AsyncStorage.setItem(STORAGE_KEY, level.key).catch(() => {});
  }, [levelIndex]);

  const value = useMemo(() => ({
    version,
    level: TEXT_SCALE_LEVELS[levelIndex].key,
    levelIndex,
    change,
    setIndex,
  }), [version, levelIndex, change, setIndex]);

  return React.createElement(TextScaleContext.Provider, { value }, children);
}
