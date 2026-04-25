import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { View, StyleSheet, useColorScheme, Platform } from 'react-native';
import { WalletProvider } from '@/models/wallet-state';
import { retryPendingUploads } from '@/services/public-key-upload';
import { hasPendingUploads } from '@/services/storage';
import { VelaColor } from '@/constants/theme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    hasPendingUploads().then((has) => {
      if (has) {
        retryPendingUploads().catch(() => {});
      }
    });
  }, []);

  const content = (
    <WalletProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="send" options={{ presentation: 'modal' }} />
          <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
          <Stack.Screen name="token-detail" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-token" options={{ presentation: 'modal' }} />
          <Stack.Screen name="history" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </WalletProvider>
  );

  // Web: constrain to phone-like dimensions
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webOuter}>
        <View style={styles.webPhone}>{content}</View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E8E8',
  },
  webPhone: {
    width: 390,
    height: 844,
    maxHeight: '100vh' as any,
    backgroundColor: VelaColor.bg,
    borderRadius: 20,
    overflow: 'hidden',
    // Shadow to look like a device frame
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
    } as any : {}),
  },
});
