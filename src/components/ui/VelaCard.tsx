import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { VelaColor, VelaRadius } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function VelaCard({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: VelaColor.bgCard,
    borderRadius: VelaRadius.card,
    borderWidth: 1,
    borderColor: VelaColor.border,
  },
});
