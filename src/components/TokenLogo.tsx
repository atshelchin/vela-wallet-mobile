import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { color, inter, createStyles } from '@/constants/theme';

interface Props {
  symbol: string;
  logoUrl?: string | null;
  size?: number;
  bgColor?: string;
  textColor?: string;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 55%)`;
}

function stringToBgColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 30%, 93%)`;
}

function LetterFallback({ symbol, size, bg, fg }: { symbol: string; size: number; bg: string; fg: string }) {
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg, fontSize: size * 0.42 }]}>
        {symbol.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function TokenLogo({ symbol, logoUrl, size = 40, bgColor, textColor }: Props) {
  const bg = bgColor ?? stringToBgColor(symbol);
  const fg = textColor ?? stringToColor(symbol);
  const [failed, setFailed] = useState(false);

  if (!logoUrl || failed) {
    return <LetterFallback symbol={symbol} size={size} bg={bg} fg={fg} />;
  }

  return (
    <Image
      source={{ uri: logoUrl }}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      onError={() => setFailed(true)}
    />
  );
}

const styles = createStyles(() => ({
  image: {
    backgroundColor: color.bg.sunken,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...inter.bold,
  },
}));
