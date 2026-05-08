/**
 * Platform-aware entering animations.
 *
 * Problem: Reanimated `entering` animations (FadeIn, FadeInDown) start the
 * element at opacity 0.  iOS compositing hides the initial blank frame, but
 * Android often renders one visible frame at opacity 0 → flicker.
 *
 * Solution: On Android return `undefined` so the element renders instantly.
 * The press-feedback spring animations (withSpring on scale) still work
 * because those are *animated styles*, not *entering layouts*.
 */
import { Platform } from 'react-native';
import {
  FadeIn as _FadeIn,
  FadeInDown as _FadeInDown,
  FadeInUp as _FadeInUp,
} from 'react-native-reanimated';

const isIOS = Platform.OS === 'ios';

/** FadeIn — returns undefined on Android to prevent blank-frame flicker. */
export function fadeIn(delay = 0, duration = 300) {
  if (!isIOS) return undefined;
  return _FadeIn.delay(delay).duration(duration);
}

/** FadeInDown — returns undefined on Android. */
export function fadeInDown(delay = 0, duration = 300) {
  if (!isIOS) return undefined;
  return _FadeInDown.delay(delay).duration(duration);
}

/** FadeInUp — returns undefined on Android. */
export function fadeInUp(delay = 0, duration = 400) {
  if (!isIOS) return undefined;
  return _FadeInUp.delay(delay).duration(duration);
}
