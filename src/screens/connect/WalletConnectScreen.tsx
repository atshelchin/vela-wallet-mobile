/**
 * WalletConnect v2 screen — used on web platform.
 * Connects to dApps via WalletConnect protocol instead of BLE.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { useWallet, shortAddress } from '@/models/wallet-state';
import { shortAddr, type BLEIncomingRequest } from '@/models/types';
import { PasskeyErrorCode } from '@/modules/passkey';
import { handleDAppRequest, isSigningMethod, handleReadOnlyRPC } from '@/hooks/use-dapp-signing';

type ConnectState = 'idle' | 'connecting' | 'connected';

export default function WalletConnectScreen() {
  const { state, activeAccount } = useWallet();
  const address = activeAccount?.address ?? state.address;
  const accountName = activeAccount?.name ?? 'Wallet';

  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [wcUri, setWcUri] = useState('');
  const [peerName, setPeerName] = useState('');
  const [incomingRequest, setIncomingRequest] = useState<BLEIncomingRequest | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [currentChainId, setCurrentChainId] = useState(137); // default Polygon
  const [web3wallet, setWeb3wallet] = useState<any>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);

  const connectWC = useCallback(async () => {
    if (!wcUri.trim()) {
      Alert.alert('Error', 'Please paste a WalletConnect URI');
      return;
    }

    setConnectState('connecting');
    try {
      // Dynamic import to avoid bundling WC on native
      const { Core } = await import('@walletconnect/core');
      const { Web3Wallet } = await import('@walletconnect/web3wallet');

      const core = new Core({
        projectId: '2b8de379a677e5e4b0e1e4e5e4b0e1e4', // public demo ID
      });

      const wallet = await Web3Wallet.init({
        core: core as any,
        metadata: {
          name: 'Vela Wallet',
          description: 'Smart Account Wallet',
          url: 'https://getvela.app',
          icons: ['https://getvela.app/favicon.png'],
        },
      });

      // Handle session proposal
      wallet.on('session_proposal', async (proposal: any) => {
        const { id, params } = proposal;
        const namespaces: any = {};

        // Build approval namespaces
        const chains = params.requiredNamespaces?.eip155?.chains ?? ['eip155:137'];
        const methods = params.requiredNamespaces?.eip155?.methods ?? [
          'eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4',
          'eth_accounts', 'eth_chainId',
        ];
        const events = params.requiredNamespaces?.eip155?.events ?? [
          'chainChanged', 'accountsChanged',
        ];

        namespaces.eip155 = {
          chains,
          accounts: chains.map((c: string) => `${c}:${address}`),
          methods,
          events,
        };

        try {
          const session = await wallet.approveSession({ id, namespaces });
          setActiveTopic(session.topic);
          setPeerName(session.peer?.metadata?.name ?? 'dApp');
          setConnectState('connected');
        } catch {
          setConnectState('idle');
        }
      });

      // Handle session requests
      wallet.on('session_request', async (event: any) => {
        const { id, topic, params } = event;
        const { request } = params;
        const method = request.method;
        const reqParams = request.params ?? [];
        const chainIdFromParams = params.chainId?.split(':')[1];
        const cid = chainIdFromParams ? parseInt(chainIdFromParams) : currentChainId;

        // Auto-reply read-only methods
        if (method === 'wallet_switchEthereumChain') {
          const cp = reqParams?.[0] as { chainId?: string } | undefined;
          if (cp?.chainId) {
            const nc = parseInt(cp.chainId, 16);
            if (!isNaN(nc)) setCurrentChainId(nc);
          }
          await wallet.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result: null } });
          return;
        }

        const readOnly = await handleReadOnlyRPC(method, reqParams, address, cid);
        if (readOnly.handled) {
          await wallet.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result: readOnly.result } });
          return;
        }

        // Signing methods — show approval UI
        if (isSigningMethod(method)) {
          setIncomingRequest({
            id: String(id),
            method,
            params: reqParams,
            origin: peerName,
          });
        } else {
          // Unknown method
          await wallet.respondSessionRequest({
            topic,
            response: { id, jsonrpc: '2.0', error: { code: -32601, message: `Method not supported: ${method}` } },
          });
        }
      });

      // Handle disconnect
      wallet.on('session_delete', () => {
        setConnectState('idle');
        setActiveTopic(null);
        setPeerName('');
        setIncomingRequest(null);
      });

      await wallet.pair({ uri: wcUri.trim() });
      setWeb3wallet(wallet);
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message ?? 'Could not connect');
      setConnectState('idle');
    }
  }, [wcUri, address, currentChainId, peerName]);

  const disconnect = useCallback(async () => {
    if (web3wallet && activeTopic) {
      try {
        await web3wallet.disconnectSession({ topic: activeTopic, reason: { code: 6000, message: 'User disconnected' } });
      } catch { /* ignore */ }
    }
    setConnectState('idle');
    setActiveTopic(null);
    setPeerName('');
    setIncomingRequest(null);
    setWeb3wallet(null);
  }, [web3wallet, activeTopic]);

  const approveRequest = useCallback(async (request: BLEIncomingRequest) => {
    if (!activeAccount || !web3wallet || !activeTopic) return;
    setIsSigning(true);
    setSignError(null);

    try {
      const result = await handleDAppRequest(
        request,
        activeAccount,
        state.address,
        currentChainId,
      );

      await web3wallet.respondSessionRequest({
        topic: activeTopic,
        response: { id: parseInt(request.id), jsonrpc: '2.0', result },
      });
      setIncomingRequest(null);
    } catch (err: any) {
      if (err?.code === PasskeyErrorCode.CANCELLED) {
        setIsSigning(false);
        return;
      }
      setSignError(err.message ?? 'Signing failed');
      try {
        await web3wallet.respondSessionRequest({
          topic: activeTopic,
          response: { id: parseInt(request.id), jsonrpc: '2.0', error: { code: -32603, message: err.message } },
        });
      } catch { /* ignore */ }
      setIncomingRequest(null);
    } finally {
      setIsSigning(false);
    }
  }, [activeAccount, state.address, currentChainId, web3wallet, activeTopic]);

  const rejectRequest = useCallback(async (request: BLEIncomingRequest) => {
    if (web3wallet && activeTopic) {
      try {
        await web3wallet.respondSessionRequest({
          topic: activeTopic,
          response: { id: parseInt(request.id), jsonrpc: '2.0', error: { code: 4001, message: 'User rejected' } },
        });
      } catch { /* ignore */ }
    }
    setIncomingRequest(null);
  }, [web3wallet, activeTopic]);

  // --- Render ---

  if (!state.hasWallet) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Create a wallet first to connect to dApps.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>WalletConnect</Text>

        {/* Wallet info */}
        <VelaCard style={styles.walletCard}>
          <Text style={styles.walletName}>{accountName}</Text>
          <Text style={styles.walletAddr}>{shortAddress(address)}</Text>
        </VelaCard>

        {connectState === 'idle' && (
          <View>
            <Text style={styles.sectionTitle}>Connect to dApp</Text>
            <Text style={styles.hint}>
              Paste a WalletConnect URI from any dApp to connect your wallet.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="wc:a1b2c3..."
              placeholderTextColor={VelaColor.textTertiary}
              value={wcUri}
              onChangeText={setWcUri}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <VelaButton
              title="Connect"
              onPress={connectWC}
              disabled={!wcUri.trim()}
            />
          </View>
        )}

        {connectState === 'connecting' && (
          <View style={styles.centered}>
            <Text style={styles.statusText}>Connecting...</Text>
          </View>
        )}

        {connectState === 'connected' && !incomingRequest && (
          <View>
            <VelaCard style={styles.connectedCard}>
              <View style={styles.connectedRow}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>Connected to {peerName}</Text>
              </View>
            </VelaCard>

            <VelaButton
              title="Disconnect"
              onPress={disconnect}
              variant="secondary"
              style={{ marginTop: 16 }}
            />
          </View>
        )}

        {/* Incoming request */}
        {incomingRequest && (
          <VelaCard style={styles.requestCard}>
            <Text style={styles.requestOrigin}>{incomingRequest.origin || peerName}</Text>
            <Text style={styles.requestMethod}>{methodLabel(incomingRequest.method)}</Text>

            {incomingRequest.method === 'eth_sendTransaction' && incomingRequest.params[0] && (
              <View style={styles.txDetails}>
                <DetailRow label="To" value={shortAddr(incomingRequest.params[0].to ?? '')} />
                <DetailRow label="Value" value={incomingRequest.params[0].value ?? '0x0'} />
              </View>
            )}

            {signError && <Text style={styles.errorText}>{signError}</Text>}

            <View style={styles.buttonRow}>
              <VelaButton
                title={isSigning ? 'Signing...' : 'Approve'}
                onPress={() => approveRequest(incomingRequest)}
                variant="accent"
                loading={isSigning}
                style={{ flex: 1 }}
              />
              <View style={{ width: 12 }} />
              <VelaButton
                title="Reject"
                onPress={() => rejectRequest(incomingRequest)}
                variant="secondary"
                disabled={isSigning}
                style={{ flex: 1 }}
              />
            </View>
          </VelaCard>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function methodLabel(method: string): string {
  switch (method) {
    case 'eth_sendTransaction': return 'Send Transaction';
    case 'personal_sign': return 'Sign Message';
    case 'eth_signTypedData_v4': return 'Sign Typed Data';
    default: return method;
  }
}

const styles = StyleSheet.create({
  pageTitle: {
    ...VelaFont.heading(28),
    color: VelaColor.textPrimary,
    marginBottom: 20,
    marginTop: 8,
  },
  walletCard: {
    padding: VelaSpacing.cardPadding,
    marginBottom: 24,
  },
  walletName: {
    ...VelaFont.title(16),
    color: VelaColor.textPrimary,
  },
  walletAddr: {
    ...VelaFont.mono(13),
    color: VelaColor.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    ...VelaFont.title(18),
    color: VelaColor.textPrimary,
    marginBottom: 8,
  },
  hint: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    ...VelaFont.mono(14),
    color: VelaColor.textPrimary,
    backgroundColor: VelaColor.bgWarm,
    borderRadius: VelaRadius.cardSmall,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    ...VelaFont.body(16),
    color: VelaColor.textSecondary,
    textAlign: 'center',
  },
  statusText: {
    ...VelaFont.title(16),
    color: VelaColor.blue,
  },
  connectedCard: {
    padding: VelaSpacing.cardPadding,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: VelaColor.green,
  },
  connectedText: {
    ...VelaFont.title(16),
    color: VelaColor.textPrimary,
  },
  requestCard: {
    padding: VelaSpacing.cardPadding,
    marginTop: 16,
    gap: 12,
  },
  requestOrigin: {
    ...VelaFont.body(13),
    color: VelaColor.textSecondary,
  },
  requestMethod: {
    ...VelaFont.heading(20),
    color: VelaColor.textPrimary,
  },
  txDetails: {
    gap: 8,
    paddingVertical: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
  },
  detailValue: {
    ...VelaFont.mono(14),
    color: VelaColor.textPrimary,
    maxWidth: '60%',
  },
  errorText: {
    ...VelaFont.body(13),
    color: VelaColor.accent,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
});
