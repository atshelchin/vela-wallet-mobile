/**
 * Lightweight bar chart for balance history.
 * No third-party dependencies — pure RN Views.
 */

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { color, text, inter, space, radius, createStyles } from '@/constants/theme';
import type { BalancePoint } from '@/services/balance-history';
import { formatBalance } from '@/models/types';

interface Props {
  data: BalancePoint[];
  symbol: string;
}

export function BarChart({ data, symbol }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxBalance = Math.max(...data.map(d => d.balance), 0.0001);
  const selectedPoint = selected !== null ? data[selected] : null;

  return (
    <View style={styles.container}>
      {/* Selected day balance tooltip */}
      <View style={styles.tooltip}>
        {selectedPoint ? (
          <>
            <Text style={styles.tooltipBalance}>{formatBalance(selectedPoint.balance)} {symbol}</Text>
            <Text style={styles.tooltipDate}>{selectedPoint.label}</Text>
          </>
        ) : (
          <Text style={styles.tooltipHint}>Tap a bar to see balance</Text>
        )}
      </View>

      <View style={styles.barsRow}>
        {data.map((point, i) => {
          const heightPct = Math.max((point.balance / maxBalance) * 100, 2);
          const isToday = i === data.length - 1;
          const isSelected = selected === i;
          return (
            <Pressable key={point.label} style={styles.barCol} onPress={() => setSelected(isSelected ? null : i)}>
              <View style={styles.barWrap}>
                <View
                  style={[
                    styles.bar,
                    { height: `${heightPct}%` },
                    isToday && styles.barToday,
                    isSelected && styles.barSelected,
                  ]}
                />
              </View>
              <Text style={[styles.label, isToday && styles.labelToday, isSelected && styles.labelSelected]}>{point.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const BAR_HEIGHT = 100;

const styles = createStyles(() => ({
  container: {
    marginTop: space.lg,
  },
  tooltip: {
    alignItems: 'center',
    marginBottom: space.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  tooltipBalance: {
    fontSize: text.base,
    ...inter.bold,
    color: color.fg.base,
  },
  tooltipDate: {
    fontSize: text.xs,
    ...inter.medium,
    color: color.fg.subtle,
  },
  tooltipHint: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_HEIGHT,
    gap: space.sm,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barWrap: {
    width: '100%',
    height: BAR_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '60%',
    minHeight: 2,
    backgroundColor: color.border.base,
    borderRadius: radius.sm,
  },
  barToday: {
    backgroundColor: color.accent.base,
  },
  barSelected: {
    backgroundColor: color.fg.base,
  },
  label: {
    fontSize: 9,
    ...inter.medium,
    color: color.fg.subtle,
    marginTop: space.md,
  },
  labelToday: {
    color: color.accent.base,
    ...inter.bold,
  },
  labelSelected: {
    color: color.fg.base,
    ...inter.bold,
  },
}));
