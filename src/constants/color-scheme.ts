/**
 * Color scheme preference system — auto / light / dark.
 *
 * Follows the same pattern as text-scale.ts:
 *   - Module-level cache for synchronous startup
 *   - AsyncStorage persistence
 *   - React context for reactive updates
 *   - Synchronous rebuild BEFORE re-render (not in useEffect)
 */
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

const STORAGE_KEY = 'vela.colorScheme';

export type ColorSchemePreference = 'auto' | 'light' | 'dark';

// ---------------------------------------------------------------------------
// Synchronous module-level cache
// ---------------------------------------------------------------------------

let _preference: ColorSchemePreference = 'auto';

export function getColorSchemePreference(): ColorSchemePreference {
  return _preference;
}

/** Resolve preference + system scheme into a concrete 'light' | 'dark'. */
export function resolveColorScheme(
  pref: ColorSchemePreference,
  systemScheme: string | null | undefined,
): 'light' | 'dark' {
  if (pref === 'auto') return systemScheme === 'dark' ? 'dark' : 'light';
  return pref;
}

/** Load from storage — call once at app startup before rendering. */
export async function loadColorScheme(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      _preference = stored;
    }
  } catch {
    // Use default
  }
}

// ---------------------------------------------------------------------------
// React Context
// ---------------------------------------------------------------------------

interface ColorSchemeContextValue {
  version: number;
  preference: ColorSchemePreference;
  resolved: 'light' | 'dark';
  setPreference: (pref: ColorSchemePreference) => void;
}

const ColorSchemeContext = createContext<ColorSchemeContextValue>({
  version: 0,
  preference: 'auto',
  resolved: 'light',
  setPreference: () => {},
});

export function useColorSchemePreference() {
  return useContext(ColorSchemeContext);
}

/**
 * Provider that manages color scheme state.
 *
 * Key design: rebuildColors() is called SYNCHRONOUSLY before state updates,
 * so by the time React re-renders children, color tokens are already correct.
 * This mirrors how text-scale.ts calls rebuildTextScale() synchronously.
 */
export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ColorSchemePreference>(_preference);
  const [version, setVersion] = useState(0);
  const prevResolved = useRef<string>('');

  const resolved = resolveColorScheme(preference, systemScheme);

  // Synchronously rebuild colors during render when resolved changes.
  // This ensures color tokens are correct BEFORE children render.
  // rebuildColors is idempotent — safe to call during render.
  if (resolved !== prevResolved.current) {
    prevResolved.current = resolved;
    const { rebuildColors } = require('@/constants/theme');
    rebuildColors(resolved === 'dark');
  }

  // When system scheme changes, we need to bump version to trigger consumer re-renders.
  // The colors are already rebuilt synchronously above, but children won't re-render
  // unless the context value changes.
  const prevSystemScheme = useRef(systemScheme);
  if (systemScheme !== prevSystemScheme.current) {
    prevSystemScheme.current = systemScheme;
    // Schedule a version bump (React allows setState during render for derived state)
    // We use a micro-task to avoid the "setState during render" warning
    Promise.resolve().then(() => setVersion(v => v + 1));
  }

  const setPreference = useCallback((pref: ColorSchemePreference) => {
    _preference = pref;
    // 1. Rebuild colors SYNCHRONOUSLY before triggering re-renders
    const sys = Appearance.getColorScheme();
    const newResolved = resolveColorScheme(pref, sys);
    const { rebuildColors } = require('@/constants/theme');
    rebuildColors(newResolved === 'dark');
    // 2. Trigger re-render (React batches these)
    setPreferenceState(pref);
    setVersion(v => v + 1);
    // 3. Persist in background
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    version,
    preference,
    resolved,
    setPreference,
  }), [version, preference, resolved, setPreference]);

  return React.createElement(ColorSchemeContext.Provider, { value }, children);
}
