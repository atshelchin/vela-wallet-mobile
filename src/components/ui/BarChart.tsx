/**
 * Lightweight bar chart for balance history.
 * No third-party dependencies — pure RN Views.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { color, text, inter, space, radius, createStyles } from '@/constants/theme';
import type { BalancePoint } from '@/services/balance-history';
import { formatBalance } from '@/models/types';

interface Props {
  data: BalancePoint[];
  symbol: string;
}

export function BarChart({ data, symbol }: Props) {
  if (data.length === 0) return null;

  const maxBalance = Math.max(...data.map(d => d.balance), 0.0001); // avoid div by zero

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {data.map((point, i) => {
          const heightPct = Math.max((point.balance / maxBalance) * 100, 2); // min 2% for visibility
          const isToday = i === data.length - 1;
          return (
            <View key={point.label} style={styles.barCol}>
              <View style={styles.barWrap}>
                <View
                  style={[
                    styles.bar,
                    { height: `${heightPct}%` },
                    isToday && styles.barToday,
                  ]}
                />
              </View>
              <Text style={[styles.label, isToday && styles.labelToday]}>{point.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Min / Max legend */}
      <View style={styles.legend}>
        <Text style={styles.legendText}>
          Low: {formatBalance(Math.min(...data.map(d => d.balance)))} {symbol}
        </Text>
        <Text style={styles.legendText}>
          High: {formatBalance(maxBalance)} {symbol}
        </Text>
      </View>
    </View>
  );
}

const BAR_HEIGHT = 100;

const styles = createStyles(() => ({
  container: {
    marginTop: space.lg,
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
    backgroundColor: color.fg.subtle,
    borderRadius: radius.sm,
    opacity: 0.4,
  },
  barToday: {
    backgroundColor: color.accent.base,
    opacity: 1,
  },
  label: {
    fontSize: 9,
    ...inter.medium,
    color: color.fg.subtle,
    marginTop: space.xs,
  },
  labelToday: {
    color: color.accent.base,
    ...inter.bold,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  legendText: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
  },
}));
