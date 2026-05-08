import '@/global.css';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useColorScheme, View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { WalletProvider } from '@/models/wallet-state';
import { retryPendingUploads } from '@/services/public-key-upload';
import { hasPendingUploads } from '@/services/storage';
import { loadTextScale, TextScaleProvider, useTextScale } from '@/constants/text-scale';
import { color, rebuildTextScale } from '@/constants/theme';

/**
 * On Android, `key={version}` causes a harsh flash when the entire Stack
 * unmounts/remounts.  Instead, we crossfade: fade to 0 → swap key → fade to 1.
 * On iOS the native compositing handles remounts gracefully, so we keep the
 * simple key-swap approach.
 */
function AppShell() {
  const colorScheme = useColorScheme();
  const { version } = useTextScale();

  // On iOS: simple key swap (no flash)
  // On Android: crossfade wrapper
  const isAndroid = Platform.OS === 'android';

  const opacity = useSharedValue(1);
  const [renderedVersion, setRenderedVersion] = useState(version);

  useEffect(() => {
    if (version === renderedVersion) return;

    if (!isAndroid) {
      // iOS: immediate swap, no flash
      setRenderedVersion(version);
      return;
    }

    // Android: fade out → swap → fade in
    opacity.value = withTiming(0, { duration: 120 });
    // Wait for fade-out to finish, then swap the key
    const timer = setTimeout(() => setRenderedVersion(version), 130);
    return () => clearTimeout(timer);
  }, [version, renderedVersion, isAndroid, opacity]);

  // After version swap, fade back in
  useEffect(() => {
    if (isAndroid && opacity.value < 1) {
      // Small delay to let the new tree lay out before fading in
      opacity.value = withTiming(1, { duration: 150 });
    }
  }, [renderedVersion, isAndroid, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    flex: 1,
  }));

  const content = (
    <Stack key={renderedVersion} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="send" options={{ presentation: 'modal' }} />
      <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
      <Stack.Screen name="token-detail" options={{ presentation: 'modal' }} />
      <Stack.Screen name="add-token" options={{ presentation: 'modal' }} />
      <Stack.Screen name="history" options={{ presentation: 'modal' }} />
    </Stack>
  );

  return (
    <WalletProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {isAndroid ? (
          <Animated.View style={animatedStyle}>
            {content}
          </Animated.View>
        ) : content}
      </ThemeProvider>
    </WalletProvider>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadTextScale().then(() => {
      rebuildTextScale();
      setReady(true);
    });

    hasPendingUploads().then((has) => {
      if (has) {
        retryPendingUploads().catch(() => {});
      }
    });
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={color.accent.base} />
      </View>
    );
  }

  return (
    <TextScaleProvider>
      <AppShell />
    </TextScaleProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.bg.base,
  },
});
