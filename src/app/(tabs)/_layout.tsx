import { Tabs } from 'expo-router';
import React from 'react';
import { VelaColor } from '@/constants/theme';
import { Wallet, Globe, Settings } from 'lucide-react-native';

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
          tabBarIcon: ({ color, size }) => <Wallet size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dapps"
        options={{
          title: 'dApps',
          tabBarIcon: ({ color, size }) => <Globe size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
