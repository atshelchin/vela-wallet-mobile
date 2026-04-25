import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { VelaColor } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: VelaColor.accent,
        tabBarInactiveTintColor: VelaColor.textTertiary,
        tabBarStyle: {
          backgroundColor: VelaColor.bgCard,
          borderTopColor: VelaColor.border,
        },
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color }) => <TabIcon name="wallet" color={color} />,
        }}
      />
      <Tabs.Screen
        name="dapps"
        options={{
          title: 'dApps',
          tabBarIcon: ({ color }) => <TabIcon name="dapps" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    wallet: 'W',
    nfts: 'N',
    dapps: 'D',
    settings: 'S',
  };
  return (
    <Text style={{ color, fontSize: 18, fontWeight: '700', width: 24, textAlign: 'center' }}>
      {icons[name] ?? '?'}
    </Text>
  );
}
