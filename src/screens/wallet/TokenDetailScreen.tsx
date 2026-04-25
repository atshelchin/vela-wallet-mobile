import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaCard } from '@/components/ui/VelaCard';
import { TokenLogo } from '@/components/TokenLogo';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { formatBalance, shortAddr } from '@/models/types';
import { chainName } from '@/models/network';

export default function TokenDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    symbol: string;
    name: string;
    network: string;
    balance: string;
    decimals: string;
    logo: string;
    tokenAddress: string;
    priceUsd: string;
    chainName: string;
  }>();

  const symbol = params.symbol ?? '';
  const tokenName = params.name ?? symbol;
  const balance = parseFloat(params.balance ?? '0');
  const priceUsd = parseFloat(params.priceUsd ?? '0');
  const usdValue = balance * priceUsd;
  const logoUrl = params.logo || null;
  const contractAddress = params.tokenAddress || null;
  const network = params.network ?? '';
  const decimals = parseInt(params.decimals ?? '18', 10);
  const isNative = !contractAddress;

  // Derive chainId from network string
  const chainIdMap: Record<string, number> = {
    'eth-mainnet': 1,
    'arb-mainnet': 42161,
    'base-mainnet': 8453,
    'opt-mainnet': 10,
    'matic-mainnet': 137,
    'bnb-mainnet': 56,
    'avax-mainnet': 43114,
  };
  const chainId = chainIdMap[network] ?? 1;
  const chain = chainName(chainId);

  const formatUsd = (value: number) =>
    '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const copyContract = async () => {
    if (!contractAddress) return;
    await Clipboard.setStringAsync(contractAddress);
    Alert.alert('Copied', 'Contract address copied to clipboard.');
  };

  const handleSend = () => {
    router.push({
      pathname: '/send',
      params: { preselectedSymbol: symbol, preselectedNetwork: network },
    });
  };

  const handleReceive = () => {
    router.push('/receive');
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Nav bar */}
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backBtn}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>{symbol}</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Token header */}
        <View style={styles.tokenHeader}>
          <TokenLogo symbol={symbol} logoUrl={logoUrl} size={64} />
          <Text style={styles.tokenName}>{tokenName}</Text>
          <Text style={styles.chainLabel}>{chain}</Text>
        </View>

        {/* Balance card */}
        <VelaCard style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceValue}>
            {formatBalance(balance)} {symbol}
          </Text>
          {usdValue > 0 && (
            <Text style={styles.usdValue}>{formatUsd(usdValue)}</Text>
          )}
          {priceUsd > 0 && (
            <Text style={styles.priceLabel}>
              1 {symbol} = {formatUsd(priceUsd)}
            </Text>
          )}
        </VelaCard>

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <VelaButton title="Send" onPress={handleSend} style={styles.actionBtn} />
          <VelaButton title="Receive" onPress={handleReceive} variant="secondary" style={styles.actionBtn} />
        </View>

        {/* Token info */}
        <VelaCard style={styles.infoCard}>
          <InfoRow label="Type" value={isNative ? 'Native' : 'ERC-20'} />
          <View style={styles.separator} />
          <InfoRow label="Network" value={chain} />
          <View style={styles.separator} />
          <InfoRow label="Decimals" value={String(decimals)} />
          {contractAddress && (
            <>
              <View style={styles.separator} />
              <TouchableOpacity onPress={copyContract} activeOpacity={0.7}>
                <InfoRow label="Contract" value={shortAddr(contractAddress)} copyable />
              </TouchableOpacity>
            </>
          )}
        </VelaCard>
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueRow}>
        <Text style={styles.infoValue}>{value}</Text>
        {copyable && <Text style={styles.copyIcon}>⧉</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 100,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  backBtn: {
    ...VelaFont.title(16),
    color: VelaColor.accent,
    width: 50,
  },
  navTitle: {
    ...VelaFont.title(17),
    color: VelaColor.textPrimary,
  },
  tokenHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  tokenName: {
    ...VelaFont.heading(22),
    color: VelaColor.textPrimary,
  },
  chainLabel: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
  },
  balanceCard: {
    padding: VelaSpacing.cardPadding,
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  balanceLabel: {
    ...VelaFont.label(13),
    color: VelaColor.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    ...VelaFont.heading(28),
    color: VelaColor.textPrimary,
  },
  usdValue: {
    ...VelaFont.title(18),
    color: VelaColor.textSecondary,
  },
  priceLabel: {
    ...VelaFont.body(13),
    color: VelaColor.textTertiary,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
  },
  infoCard: {
    padding: VelaSpacing.cardPadding,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoValue: {
    ...VelaFont.title(14),
    color: VelaColor.textPrimary,
  },
  copyIcon: {
    fontSize: 14,
    color: VelaColor.accent,
  },
  separator: {
    height: 1,
    backgroundColor: VelaColor.border,
  },
});
