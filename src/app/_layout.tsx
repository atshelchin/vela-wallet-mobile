import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { WalletProvider } from '@/models/wallet-state';
import { retryPendingUploads } from '@/services/public-key-upload';
import { hasPendingUploads } from '@/services/storage';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Retry any failed public key uploads on app launch
  useEffect(() => {
    hasPendingUploads().then((has) => {
      if (has) {
        retryPendingUploads().catch(() => {});
      }
    });
  }, []);

  return (
    <WalletProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="send" options={{ presentation: 'modal' }} />
          <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
          <Stack.Screen name="token-detail" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-token" options={{ presentation: 'modal' }} />
          <Stack.Screen name="nft-detail" options={{ presentation: 'modal' }} />
          <Stack.Screen name="history" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </WalletProvider>
  );
}
