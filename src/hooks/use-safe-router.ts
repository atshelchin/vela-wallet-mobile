import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Wraps expo-router's `router.back()` so it never fires `GO_BACK` when there
 * is no screen to go back to (common on web when opening a route directly).
 */
export function useSafeRouter() {
  const router = useRouter();

  const back = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/wallet');
    }
  }, [router]);

  return { ...router, back };
}
