import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { DEFAULT_NETWORKS } from '@/models/network';
import { saveCustomToken } from '@/services/storage';
import type { CustomToken } from '@/models/types';

// Minimal ABI-encoded function selectors for ERC-20 metadata
const NAME_SELECTOR = '0x06fdde03';
const SYMBOL_SELECTOR = '0x95d89b41';
const DECIMALS_SELECTOR = '0x313ce567';

function hexToUtf8(hex: string): string {
  // ABI-encoded string: skip offset (32 bytes) + length (32 bytes), then read data
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (stripped.length < 128) return '';
  const lengthHex = stripped.slice(64, 128);
  const strLength = parseInt(lengthHex, 16);
  const dataHex = stripped.slice(128, 128 + strLength * 2);
  let result = '';
  for (let i = 0; i < dataHex.length; i += 2) {
    const code = parseInt(dataHex.slice(i, i + 2), 16);
    if (code > 0) result += String.fromCharCode(code);
  }
  return result;
}

function hexToNumber(hex: string): number {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  return parseInt(stripped, 16);
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export default function AddTokenScreen() {
  const router = useRouter();

  const [contractAddress, setContractAddress] = useState('');
  const [selectedChainId, setSelectedChainId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tokenMeta, setTokenMeta] = useState<{ name: string; symbol: string; decimals: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedNetwork = DEFAULT_NETWORKS.find((n) => n.chainId === selectedChainId);

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(contractAddress);

  const fetchTokenMetadata = async () => {
    if (!isValidAddress || !selectedNetwork) return;

    setLoading(true);
    setTokenMeta(null);

    try {
      const [nameResult, symbolResult, decimalsResult] = await Promise.all([
        ethCall(selectedNetwork.rpcURL, contractAddress, NAME_SELECTOR),
        ethCall(selectedNetwork.rpcURL, contractAddress, SYMBOL_SELECTOR),
        ethCall(selectedNetwork.rpcURL, contractAddress, DECIMALS_SELECTOR),
      ]);

      const name = hexToUtf8(nameResult);
      const symbol = hexToUtf8(symbolResult);
      const decimals = hexToNumber(decimalsResult);

      if (!name || !symbol) {
        Alert.alert('Not Found', 'Could not find a valid ERC-20 token at this address.');
        return;
      }

      setTokenMeta({ name, symbol, decimals });
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch token metadata. Check the address and network.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tokenMeta || !selectedNetwork) return;

    setSaving(true);
    try {
      const token: CustomToken = {
        id: `${selectedChainId}_${contractAddress.toLowerCase()}`,
        chainId: selectedChainId,
        contractAddress: contractAddress.toLowerCase(),
        symbol: tokenMeta.symbol,
        name: tokenMeta.name,
        decimals: tokenMeta.decimals,
        networkName: selectedNetwork.displayName,
      };

      await saveCustomToken(token);
      Alert.alert('Token Added', `${tokenMeta.symbol} has been added to your wallet.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save token.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Nav bar */}
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Add Token</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Chain selector */}
        <Text style={styles.fieldLabel}>Network</Text>
        <VelaCard style={styles.chainCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chainScroll}>
            {DEFAULT_NETWORKS.map((network) => {
              const isSelected = network.chainId === selectedChainId;
              return (
                <TouchableOpacity
                  key={network.id}
                  style={[styles.chainChip, isSelected && styles.chainChipSelected]}
                  onPress={() => {
                    setSelectedChainId(network.chainId);
                    setTokenMeta(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.chainDot, { backgroundColor: network.iconColor }]} />
                  <Text
                    style={[styles.chainChipText, isSelected && styles.chainChipTextSelected]}
                  >
                    {network.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </VelaCard>

        {/* Contract address input */}
        <Text style={styles.fieldLabel}>Contract Address</Text>
        <TextInput
          style={styles.input}
          placeholder="0x..."
          placeholderTextColor={VelaColor.textTertiary}
          value={contractAddress}
          onChangeText={(text) => {
            setContractAddress(text);
            setTokenMeta(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Fetch button */}
        <VelaButton
          title="Fetch Token Info"
          onPress={fetchTokenMetadata}
          disabled={!isValidAddress || loading}
          loading={loading}
          variant="secondary"
          style={styles.fetchBtn}
        />

        {/* Token metadata result */}
        {tokenMeta && (
          <VelaCard style={styles.resultCard}>
            <Text style={styles.resultTitle}>Token Found</Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Name</Text>
              <Text style={styles.resultValue}>{tokenMeta.name}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Symbol</Text>
              <Text style={styles.resultValue}>{tokenMeta.symbol}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Decimals</Text>
              <Text style={styles.resultValue}>{tokenMeta.decimals}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Network</Text>
              <Text style={styles.resultValue}>{selectedNetwork?.displayName}</Text>
            </View>

            <VelaButton
              title="Add to Wallet"
              onPress={handleSave}
              variant="accent"
              loading={saving}
              style={styles.saveBtn}
            />
          </VelaCard>
        )}
      </ScrollView>
    </ScreenContainer>
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
    marginBottom: 8,
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
  fieldLabel: {
    ...VelaFont.label(13),
    color: VelaColor.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 20,
  },
  chainCard: {
    padding: 4,
  },
  chainScroll: {
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  chainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: VelaRadius.full,
    backgroundColor: VelaColor.bgWarm,
  },
  chainChipSelected: {
    backgroundColor: VelaColor.textPrimary,
  },
  chainDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chainChipText: {
    ...VelaFont.label(13),
    color: VelaColor.textPrimary,
  },
  chainChipTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: VelaColor.bgWarm,
    borderRadius: VelaRadius.cardSmall,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...VelaFont.mono(14),
    color: VelaColor.textPrimary,
  },
  fetchBtn: {
    marginTop: 16,
  },
  resultCard: {
    padding: VelaSpacing.cardPadding,
    marginTop: 24,
  },
  resultTitle: {
    ...VelaFont.title(17),
    color: VelaColor.green,
    marginBottom: 16,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  resultLabel: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
  },
  resultValue: {
    ...VelaFont.title(14),
    color: VelaColor.textPrimary,
  },
  separator: {
    height: 1,
    backgroundColor: VelaColor.border,
  },
  saveBtn: {
    marginTop: 20,
  },
});
