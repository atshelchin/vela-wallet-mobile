import React from 'react';
import { View, Text } from 'react-native';
import { weight, createStyles } from '@/constants/theme';

interface Props {
  label: string;
  color: string;
  bgColor: string;
  size?: number;
}

export function ChainLogo({ label, color, bgColor, size = 32 }: Props) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
      <Text style={[styles.label, { color, fontSize: size * 0.3 }]}>{label}</Text>
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: weight.bold,
  },
}));
