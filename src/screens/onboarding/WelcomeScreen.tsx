import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Pressable, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { fadeIn, fadeInUp } from '@/constants/entering';
import { color, text, inter, space, radius, font, motion, createStyles } from '@/constants/theme';
import { useColorSchemePreference, type ColorSchemePreference } from '@/constants/color-scheme';
import { AppModal } from '@/components/ui/AppModal';
import { loadServiceEndpoints, saveServiceEndpoints } from '@/services/storage';
import { DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';
import type { ServiceEndpoints } from '@/models/types';
import { Settings, X, RefreshCw, Sun, Moon, Monitor } from 'lucide-react-native';
import { hapticLight } from '@/services/platform';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  onCreateWallet: () => void;
  onLogin: () => void;
  loginLoading?: boolean;
}

function AnimatedButton({
  onPress,
  style,
  children,
  disabled,
}: {
  onPress: () => void;
  style: any;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.97, motion.spring); }}
      onPressOut={() => { scale.value = withSpring(1, motion.spring); }}
      disabled={disabled}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function WelcomeScreen({ onCreateWallet, onLogin, loginLoading }: Props) {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.logoSection}>
          <Animated.View entering={fadeIn(200, 600)}>
            <Text style={styles.logo}>
              vel<Text style={styles.logoAccent}>a</Text>
            </Text>
          </Animated.View>
          <Animated.View entering={fadeIn(500, 600)}>
            <Text style={styles.tagline}>
              Your keys, your coins.{'\n'}Simple as a tap.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={styles.buttonSection} entering={fadeInUp(700, 500)}>
          <AnimatedButton onPress={onCreateWallet} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Create Wallet</Text>
          </AnimatedButton>

          <AnimatedButton
            onPress={onLogin}
            style={styles.secondaryBtn}
            disabled={loginLoading}
          >
            {loginLoading ? (
              <ActivityIndicator color="rgba(255,255,255,0.5)" />
            ) : (
              <Text style={styles.secondaryBtnText}>I already have a wallet</Text>
            )}
          </AnimatedButton>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: '#1A1A18', // Always dark — brand identity screen
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: space['3xl'],
  },
  logoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    ...inter.bold,
    color: '#FFFFFF', // Always white on dark brand screen
    letterSpacing: 3,
  },
  logoAccent: {
    color: '#E8572A', // Hardcoded accent for brand screen
  },
  tagline: {
    fontSize: text.lg,
    ...inter.regular,
    color: 'rgba(255,255,255,0.45)',
    marginTop: space.xl,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonSection: {
    paddingBottom: space['3xl'],
    gap: space.lg,
  },
  primaryBtn: {
    paddingVertical: space['2xl'],
    borderRadius: radius.xl,
    backgroundColor: '#E8572A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: text.lg,
    ...inter.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    paddingVertical: space['2xl'],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: text.lg,
    ...inter.semibold,
    color: 'rgba(255,255,255,0.5)',
  },
}));
