import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { color, radius, createStyles } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function VelaCard({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = createStyles(() => ({
  card: {
    backgroundColor: color.bg.raised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border.base,
  },
}));
