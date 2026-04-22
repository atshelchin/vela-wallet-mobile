import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { useWallet, shortAddress } from '@/models/wallet-state';
import { DEFAULT_NETWORKS } from '@/models/network';
import * as WebBrowser from 'expo-web-browser';

// MARK: - Types

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  status: 'success' | 'failed' | 'pending';
  chainId: number;
  isIncoming: boolean;
}

interface TransactionGroup {
  title: string;
  data: Transaction[];
}

// MARK: - Helpers

function explorerUrlForAddress(address: string, chainId: number): string {
  const network = DEFAULT_NETWORKS.find((n) => n.chainId === chainId);
  const base = network?.explorerURL ?? 'https://etherscan.io';
  return `${base}/address/${address}`;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEthValue(weiHex: string): string {
  try {
    const wei = BigInt(weiHex);
    const eth = Number(wei) / 1e18;
    if (eth === 0) return '0';
    if (eth < 0.0001) return '< 0.0001';
    return eth.toFixed(4).replace(/\.?0+$/, '');
  } catch {
    return '0';
  }
}

function groupByDate(txs: Transaction[]): TransactionGroup[] {
  const groups: Record<string, Transaction[]> = {};
  for (const tx of txs) {
    const key = formatDate(tx.timestamp);
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

// MARK: - Component

export default function HistoryScreen() {
  const router = useRouter();
  const { activeAccount, state } = useWallet();
  const address = activeAccount?.address ?? state.address;

  const [transactions] = useState<Transaction[]>([]);
  const [loading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState(1);

  const selectedNetwork = DEFAULT_NETWORKS.find((n) => n.chainId === selectedChainId);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Placeholder: when a real API is wired up, refresh here
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleViewOnExplorer = useCallback(() => {
    if (!address) return;
    const url = explorerUrlForAddress(address, selectedChainId);
    WebBrowser.openBrowserAsync(url);
  }, [address, selectedChainId]);

  const handleBack = () => router.back();

  // MARK: - Transaction Row

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const iconLabel = item.isIncoming ? '\u2193' : '\u2191';
    const iconBg = item.isIncoming ? VelaColor.greenSoft : VelaColor.accentSoft;
    const iconColor = item.isIncoming ? VelaColor.green : VelaColor.accent;
    const counterparty = item.isIncoming ? item.from : item.to;
    const sign = item.isIncoming ? '+' : '-';
    const amountColor = item.isIncoming ? VelaColor.green : VelaColor.textPrimary;
    const nativeSym =
      DEFAULT_NETWORKS.find((n) => n.chainId === item.chainId)?.iconLabel ?? 'ETH';
    const statusColor =
      item.status === 'failed'
        ? VelaColor.accent
        : item.status === 'pending'
          ? VelaColor.textTertiary
          : VelaColor.textSecondary;

    return (
      <TouchableOpacity
        style={styles.txRow}
        activeOpacity={0.7}
        onPress={() => {
          const network = DEFAULT_NETWORKS.find((n) => n.chainId === item.chainId);
          const base = network?.explorerURL ?? 'https://etherscan.io';
          WebBrowser.openBrowserAsync(`${base}/tx/${item.hash}`);
        }}
      >
        {/* Icon */}
        <View style={[styles.txIcon, { backgroundColor: iconBg }]}>
          <Text style={[styles.txIconText, { color: iconColor }]}>{iconLabel}</Text>
        </View>

        {/* Info */}
        <View style={styles.txInfo}>
          <Text style={styles.txType}>
            {item.isIncoming ? 'Received' : 'Sent'}
          </Text>
          <Text style={styles.txAddress}>
            {item.isIncoming ? 'From ' : 'To '}
            {shortAddress(counterparty)}
          </Text>
        </View>

        {/* Amount + time */}
        <View style={styles.txValues}>
          <Text style={[styles.txAmount, { color: amountColor }]}>
            {sign}
            {formatEthValue(item.value)} {nativeSym}
          </Text>
          <Text style={[styles.txTime, { color: statusColor }]}>
            {item.status === 'pending'
              ? 'Pending'
              : item.status === 'failed'
                ? 'Failed'
                : formatTime(item.timestamp)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // MARK: - Section Header

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  // MARK: - Empty State

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <VelaCard style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>{'\uD83D\uDCCB'}</Text>
        <Text style={styles.emptyTitle}>No Transaction History</Text>
        <Text style={styles.emptyBody}>
          On-chain transaction history is available via your network's block explorer. Tap below
          to view your full history.
        </Text>
        <VelaButton
          title={`View on ${selectedNetwork?.displayName ?? 'Explorer'}`}
          onPress={handleViewOnExplorer}
          variant="accent"
          style={styles.explorerBtn}
        />
        <VelaButton
          title="Open a Different Explorer"
          onPress={() => {}}
          variant="secondary"
          style={styles.explorerBtn}
        />
      </VelaCard>

      {/* Network Selector */}
      <Text style={styles.networkLabel}>SELECT NETWORK</Text>
      <VelaCard style={styles.networkCard}>
        {DEFAULT_NETWORKS.map((net) => {
          const isSelected = net.chainId === selectedChainId;
          return (
            <TouchableOpacity
              key={net.id}
              style={[styles.networkRow, isSelected && styles.networkRowSelected]}
              activeOpacity={0.7}
              onPress={() => setSelectedChainId(net.chainId)}
            >
              <View style={[styles.networkDot, { backgroundColor: net.iconColor }]} />
              <Text
                style={[
                  styles.networkName,
                  isSelected && styles.networkNameSelected,
                ]}
              >
                {net.displayName}
              </Text>
              {isSelected && <Text style={styles.networkCheck}>{'\u2713'}</Text>}
            </TouchableOpacity>
          );
        })}
      </VelaCard>
    </View>
  );

  // MARK: - Render

  const groups = groupByDate(transactions);

  // Flatten groups for FlatList with section headers
  type ListItem =
    | { type: 'header'; title: string; key: string }
    | { type: 'tx'; tx: Transaction; key: string };

  const listData: ListItem[] = [];
  for (const group of groups) {
    listData.push({ type: 'header', title: group.title, key: `h-${group.title}` });
    for (const tx of group.data) {
      listData.push({ type: 'tx', tx, key: tx.hash });
    }
  }

  return (
    <ScreenContainer>
      {/* Nav Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.navBack}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>History</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Address pill */}
      {address ? (
        <View style={styles.addressRow}>
          <Text style={styles.addressText}>{shortAddress(address)}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={VelaColor.accent} />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      ) : transactions.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) =>
            item.type === 'header'
              ? renderSectionHeader(item.title)
              : renderTransaction({ item: item.tx })
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={VelaColor.accent}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </ScreenContainer>
  );
}

// MARK: - Styles

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  navBack: {
    ...VelaFont.title(16),
    color: VelaColor.accent,
    width: 60,
  },
  navTitle: {
    ...VelaFont.heading(18),
    color: VelaColor.textPrimary,
  },
  addressRow: {
    alignSelf: 'center',
    backgroundColor: VelaColor.bgWarm,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: VelaRadius.full,
    marginBottom: 16,
  },
  addressText: {
    ...VelaFont.mono(13),
    color: VelaColor.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    ...VelaFont.body(15),
    color: VelaColor.textSecondary,
  },
  listContent: {
    paddingBottom: 40,
  },
  // Section Headers
  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    ...VelaFont.label(13),
    color: VelaColor.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Transaction Row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: VelaSpacing.itemGap,
    gap: 12,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconText: {
    fontSize: 20,
    fontWeight: '700',
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txType: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  txAddress: {
    ...VelaFont.body(13),
    color: VelaColor.textSecondary,
  },
  txValues: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmount: {
    ...VelaFont.title(15),
  },
  txTime: {
    ...VelaFont.body(12),
    color: VelaColor.textSecondary,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    paddingTop: 8,
  },
  emptyCard: {
    padding: VelaSpacing.cardPadding,
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    ...VelaFont.heading(20),
    color: VelaColor.textPrimary,
  },
  emptyBody: {
    ...VelaFont.body(15),
    color: VelaColor.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  explorerBtn: {
    marginTop: 4,
    width: '100%',
  },
  // Network selector
  networkLabel: {
    ...VelaFont.label(13),
    color: VelaColor.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 28,
    marginBottom: 10,
  },
  networkCard: {
    paddingVertical: 4,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: VelaSpacing.cardPadding,
    gap: 12,
  },
  networkRowSelected: {
    backgroundColor: VelaColor.bgWarm,
  },
  networkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  networkName: {
    ...VelaFont.body(15),
    color: VelaColor.textPrimary,
    flex: 1,
  },
  networkNameSelected: {
    ...VelaFont.title(15),
  },
  networkCheck: {
    ...VelaFont.title(16),
    color: VelaColor.accent,
  },
});
