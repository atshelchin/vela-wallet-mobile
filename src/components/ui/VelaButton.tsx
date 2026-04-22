import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { VelaColor, VelaFont, VelaRadius } from '@/constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'accent';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function VelaButton({ title, onPress, variant = 'primary', disabled, loading, style }: Props) {
  // primary: dark bg, white text
  // secondary: transparent bg, border, dark text
  // accent: orange bg, white text
  const bgColor = variant === 'primary' ? VelaColor.textPrimary : variant === 'accent' ? VelaColor.accent : 'transparent';
  const textColor = variant === 'secondary' ? VelaColor.textPrimary : '#FFFFFF';
  const borderColor = variant === 'secondary' ? VelaColor.border : 'transparent';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.button,
        { backgroundColor: bgColor, borderColor, borderWidth: variant === 'secondary' ? 1.5 : 0 },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 17,
    borderRadius: VelaRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...VelaFont.label(16),
  },
  disabled: {
    opacity: 0.5,
  },
});
