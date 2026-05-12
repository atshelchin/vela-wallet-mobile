import React from 'react';
import { KeyboardAvoidingView, Platform, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space, createStyles } from '@/constants/theme';
import { useTextScale } from '@/constants/text-scale';
import { useColorSchemePreference } from '@/constants/color-scheme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/**
 * Standard screen wrapper with safe area, consistent padding, and keyboard avoidance.
 *
 * Uses `key={resolved}` so that when the color scheme changes, the entire
 * children tree remounts with fresh color tokens. Theme switches are rare,
 * so the brief remount is acceptable for guaranteed correctness.
 */
export function ScreenContainer({ children, style, edges = ['top'] }: Props) {
  useTextScale();
  const { resolved } = useColorSchemePreference();

  return (
    <View style={[styles.container, style]} key={resolved}>
      <SafeAreaView style={styles.safeArea} edges={edges}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: color.bg.base,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: space['3xl'],
  },
  keyboardAvoiding: {
    flex: 1,
  },
}));
