import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { TokenLogo } from '@/components/TokenLogo';
import { VelaColor, VelaFont, VelaSpacing } from '@/constants/theme';
import { useWallet } from '@/models/wallet-state';
import { fetchTokens } from '@/services/wallet-api';
import { tokenUsdValue, tokenBalanceDouble, tokenLogoURL, tokenChainId, formatBalance, shortAddr, type APIToken } from '@/models/types';
import { chainName } from '@/models/network';

const AUTO_REFRESH_MS = 30_000;

function formatUsd(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TokenRow({ token, onPress }: { token: APIToken; onPress: () => void }) {
  const balance = tokenBalanceDouble(token);
  const usd = tokenUsdValue(token);
  const logo = tokenLogoURL(token);
  const chain = chainName(tokenChainId(token));

  return (
    <TouchableOpacity style={styles.tokenRow} onPress={onPress} activeOpacity={0.7}>
      <TokenLogo symbol={token.symbol} logoUrl={logo} size={40} />
      <View style={styles.tokenInfo}>
        <Text style={styles.tokenName} numberOfLines={1}>{token.name || token.symbol}</Text>
        <Text style={styles.tokenChain}>{chain}</Text>
      </View>
      <View style={styles.tokenValues}>
        <Text style={styles.tokenBalance}>{formatBalance(balance)} {token.symbol}</Text>
        {usd > 0 && <Text style={styles.tokenUsd}>{formatUsd(usd)}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { activeAccount, state } = useWallet();

  const [tokens, setTokens] = useState<APIToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const address = activeAccount?.address ?? state.address;
  const accountName = activeAccount?.name ?? 'Wallet';

  const loadTokens = useCallback(async (silent = false) => {
    if (!address) return;
    if (!silent) setLoading(true);
    try {
      const result = await fetchTokens(address);
      // Sort by USD value descending
      result.sort((a, b) => tokenUsdValue(b) - tokenUsdValue(a));
      setTokens(result);
    } catch (err) {
      if (!silent) {
        Alert.alert('Error', 'Failed to load token balances.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => loadTokens(true), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadTokens]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTokens();
  }, [loadTokens]);

  const totalUsd = tokens.reduce((sum, t) => sum + tokenUsdValue(t), 0);

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert('Copied', 'Address copied to clipboard.');
  };

  const navigateToToken = (token: APIToken) => {
    router.push({
      pathname: '/wallet/token-detail',
      params: {
        symbol: token.symbol,
        name: token.name,
        network: token.network,
        balance: token.balance,
        decimals: String(token.decimals),
        logo: token.logo ?? '',
        tokenAddress: token.tokenAddress ?? '',
        priceUsd: String(token.priceUsd ?? 0),
        chainName: token.chainName,
      },
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Account name + address */}
      <TouchableOpacity style={styles.accountRow} onPress={copyAddress} activeOpacity={0.7}>
        <Text style={styles.accountName}>{accountName}</Text>
        <Text style={styles.accountAddr}>{shortAddr(address)}</Text>
      </TouchableOpacity>

      {/* Total balance */}
      <Text style={styles.totalBalance}>{formatUsd(totalUsd)}</Text>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <ActionButton label="Send" icon="↑" onPress={() => router.push('/wallet/send')} />
        <ActionButton label="Receive" icon="↓" onPress={() => router.push('/wallet/receive')} />
        <ActionButton label="History" icon="≡" onPress={() => Alert.alert('Coming Soon', 'Transaction history is not yet available.')} />
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No tokens found</Text>
        <Text style={styles.emptySubtext}>Receive tokens to get started</Text>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <FlatList
        data={tokens}
        keyExtractor={(item) => `${item.network}_${item.tokenAddress ?? 'native'}_${item.symbol}`}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <TokenRow token={item} onPress={() => navigateToToken(item)} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={VelaColor.accent}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

function ActionButton({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.actionIconBg}>
        <Text style={styles.actionIcon}>{icon}</Text>
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  accountName: {
    ...VelaFont.title(17),
    color: VelaColor.textPrimary,
  },
  accountAddr: {
    ...VelaFont.mono(13),
    color: VelaColor.textSecondary,
  },
  totalBalance: {
    ...VelaFont.heading(36),
    color: VelaColor.textPrimary,
    marginBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 8,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  actionIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: VelaColor.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  actionLabel: {
    ...VelaFont.label(12),
    color: VelaColor.textSecondary,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: VelaSpacing.itemGap,
    paddingHorizontal: 4,
    gap: 12,
  },
  tokenInfo: {
    flex: 1,
    gap: 2,
  },
  tokenName: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  tokenChain: {
    ...VelaFont.body(13),
    color: VelaColor.textSecondary,
  },
  tokenValues: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tokenBalance: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  tokenUsd: {
    ...VelaFont.body(13),
    color: VelaColor.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyText: {
    ...VelaFont.title(17),
    color: VelaColor.textSecondary,
  },
  emptySubtext: {
    ...VelaFont.body(14),
    color: VelaColor.textTertiary,
  },
});
