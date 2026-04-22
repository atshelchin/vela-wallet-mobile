import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { generateQRMatrix } from '@/services/qrcode';

interface Props {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

export function QRCode({ value, size = 200, color = '#000000', backgroundColor = '#FFFFFF' }: Props) {
  const matrix = useMemo(() => generateQRMatrix(value), [value]);
  const moduleSize = size / matrix.length;

  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor }]}>
      {matrix.map((row, y) => (
        <View key={y} style={styles.row}>
          {row.map((cell, x) => (
            <View
              key={x}
              style={{
                width: moduleSize,
                height: moduleSize,
                backgroundColor: cell ? color : backgroundColor,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'column' },
  row: { flexDirection: 'row' },
});
