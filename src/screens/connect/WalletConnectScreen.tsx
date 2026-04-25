/**
 * Web dApp Connect screen.
 *
 * Connects to the local dApp Browser (Electron) via WebSocket on localhost:9710.
 * Same JSON protocol as BLE: {id, method, params, origin} / {id, result, error}.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Platform } from 'react-native';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { useWallet, shortAddress } from '@/models/wallet-state';
import { shortAddr, type BLEIncomingRequest } from '@/models/types';
import { PasskeyErrorCode } from '@/modules/passkey';
import { handleDAppRequest, isSigningMethod, handleReadOnlyRPC } from '@/hooks/use-dapp-signing';

const WS_URL = 'ws://localhost:9710';
const DPP_PROTOCOL = 'vela-dapp://connect';
const DPP_DOWNLOAD_URL = 'https://getvela.app/dpp-browser';

type ConnectState = 'idle' | 'connecting' | 'connected' | 'not-installed';

export default function WebConnectScreen() {
  const { state, activeAccount } = useWallet();
  const address = activeAccount?.address ?? state.address;
  const accountName = activeAccount?.name ?? 'Wallet';

  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [peerName, setPeerName] = useState('');
  const [incomingRequest, setIncomingRequest] = useState<BLEIncomingRequest | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [currentChainId, setCurrentChainId] = useState(137);

  const wsRef = useRef<WebSocket | null>(null);
  const chainIdRef = useRef(currentChainId);
  const addressRef = useRef(address);

  useEffect(() => { chainIdRef.current = currentChainId; }, [currentChainId]);
  useEffect(() => { addressRef.current = address; }, [address]);

  // --- WebSocket connection ---

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectState('connecting');
    let didConnect = false;

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WS] Connected to dApp Browser');
      didConnect = true;
      setConnectState('connected');
      setPeerName('dApp Browser');

      ws.send(JSON.stringify({
        type: 'wallet_info',
        address: addressRef.current,
        chainId: chainIdRef.current,
        name: accountName,
        accounts: state.accounts.map(a => ({ name: a.name, address: a.address })),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
        handleMessage(msg);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      wsRef.current = null;
      setIncomingRequest(null);
      if (didConnect) {
        setConnectState('idle'); // was connected, now disconnected
      }
    };

    ws.onerror = () => {
      if (!didConnect) {
        // Never connected — dApp browser not running
        console.log('[WS] Connection refused');
        ws.close();
        wsRef.current = null;
        tryLaunchDppBrowser();
      }
    };

    wsRef.current = ws;
  }, [accountName, state.accounts]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnectState('idle');
    setIncomingRequest(null);
  }, []);

  // --- Try to launch dApp browser via custom protocol ---

  const tryLaunchDppBrowser = useCallback(() => {
    if (Platform.OS !== 'web') return;

    // Try custom protocol to launch desktop app
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = DPP_PROTOCOL;
    document.body.appendChild(iframe);

    // If the app doesn't open within 2 seconds, show download link
    setTimeout(() => {
      document.body.removeChild(iframe);
      setConnectState('not-installed');
    }, 2000);
  }, []);

  // --- Handle incoming messages ---

  const handleMessage = useCallback((msg: any) => {
    // It's a request from dApp browser
    if (msg.id && msg.method) {
      const { id, method, params = [], origin = '' } = msg;
      const addr = addressRef.current;
      const cid = chainIdRef.current;

      // Chain switch
      if (method === 'wallet_switchEthereumChain') {
        const cp = params?.[0] as { chainId?: string } | undefined;
        if (cp?.chainId) {
          const nc = parseInt(cp.chainId, 16);
          if (!isNaN(nc)) { chainIdRef.current = nc; setCurrentChainId(nc); }
        }
        sendResponse(id, null);
        return;
      }

      // Auto-reply read-only methods
      handleReadOnlyRPC(method, params, addr, cid).then(result => {
        if (result.handled) {
          sendResponse(id, result.result);
        } else if (isSigningMethod(method)) {
          // Show approval UI
          setIncomingRequest({ id, method, params, origin, favicon: undefined });
        } else {
          sendResponse(id, undefined, { code: -32601, message: `Not supported: ${method}` });
        }
      });
    }
  }, []);

  const sendResponse = useCallback((id: string, result?: any, error?: { code: number; message: string }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: any = { id };
    if (error) msg.error = error;
    else msg.result = result ?? null;
    ws.send(JSON.stringify(msg));
  }, []);

  // --- Approve / Reject ---

  const approveRequest = useCallback(async (request: BLEIncomingRequest) => {
    if (!activeAccount) return;
    setIsSigning(true);
    setSignError(null);

    try {
      const result = await handleDAppRequest(
        request, activeAccount, state.address, chainIdRef.current,
      );
      sendResponse(request.id, result);
      setIncomingRequest(null);
    } catch (err: any) {
      if (err?.code === PasskeyErrorCode.CANCELLED) {
        setIsSigning(false);
        return;
      }
      setSignError(err.message ?? 'Signing failed');
      sendResponse(request.id, undefined, { code: -32603, message: err.message });
      setIncomingRequest(null);
    } finally {
      setIsSigning(false);
    }
  }, [activeAccount, state.address, sendResponse]);

  const rejectRequest = useCallback((request: BLEIncomingRequest) => {
    sendResponse(request.id, undefined, { code: 4001, message: 'User rejected' });
    setIncomingRequest(null);
  }, [sendResponse]);

  // Update wallet info when account/chain changes
  useEffect(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'wallet_info',
        address,
        chainId: currentChainId,
        name: accountName,
        accounts: state.accounts.map(a => ({ name: a.name, address: a.address })),
      }));
    }
  }, [address, accountName, currentChainId]);

  // Cleanup on unmount
  useEffect(() => () => { wsRef.current?.close(); }, []);

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
        <Text style={styles.pageTitle}>dApps</Text>

        <VelaCard style={styles.walletCard}>
          <Text style={styles.walletName}>{accountName}</Text>
          <Text style={styles.walletAddr}>{shortAddress(address)}</Text>
        </VelaCard>

        {/* Idle — connect button */}
        {connectState === 'idle' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connect to dApp Browser</Text>
            <Text style={styles.hint}>
              Connect to the local dApp Browser to interact with decentralized applications.
            </Text>
            <VelaButton title="Connect" onPress={connect} />
          </View>
        )}

        {/* Connecting */}
        {connectState === 'connecting' && (
          <View style={styles.centered}>
            <Text style={styles.statusText}>Connecting...</Text>
          </View>
        )}

        {/* Not installed — show download */}
        {connectState === 'not-installed' && (
          <VelaCard style={styles.notInstalledCard}>
            <Text style={styles.notInstalledTitle}>dApp Browser not found</Text>
            <Text style={styles.notInstalledText}>
              Install the dApp Browser desktop application to connect to dApps from your wallet.
            </Text>
            <VelaButton
              title="Download dApp Browser"
              onPress={() => {
                if (Platform.OS === 'web') window.open(DPP_DOWNLOAD_URL, '_blank');
                else Linking.openURL(DPP_DOWNLOAD_URL);
              }}
              variant="accent"
              style={{ marginTop: 12 }}
            />
            <VelaButton
              title="Try Again"
              onPress={connect}
              variant="secondary"
              style={{ marginTop: 8 }}
            />
          </VelaCard>
        )}

        {/* Connected — no pending request */}
        {connectState === 'connected' && !incomingRequest && (
          <View>
            <VelaCard style={styles.connectedCard}>
              <View style={styles.connectedRow}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>Connected to {peerName}</Text>
              </View>
              <Text style={styles.connectedHint}>
                Open a dApp in the browser to get started. Signing requests will appear here.
              </Text>
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
  pageTitle: { ...VelaFont.heading(28), color: VelaColor.textPrimary, marginBottom: 20, marginTop: 8 },
  walletCard: { padding: VelaSpacing.cardPadding, marginBottom: 24 },
  walletName: { ...VelaFont.title(16), color: VelaColor.textPrimary },
  walletAddr: { ...VelaFont.mono(13), color: VelaColor.textSecondary, marginTop: 4 },
  section: { gap: 12 },
  sectionTitle: { ...VelaFont.title(18), color: VelaColor.textPrimary },
  hint: { ...VelaFont.body(14), color: VelaColor.textSecondary, lineHeight: 20 },
  centered: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { ...VelaFont.body(16), color: VelaColor.textSecondary, textAlign: 'center' },
  statusText: { ...VelaFont.title(16), color: VelaColor.blue },
  connectedCard: { padding: VelaSpacing.cardPadding, gap: 8 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  connectedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: VelaColor.green },
  connectedText: { ...VelaFont.title(16), color: VelaColor.textPrimary },
  connectedHint: { ...VelaFont.body(13), color: VelaColor.textSecondary, lineHeight: 18 },
  notInstalledCard: { padding: VelaSpacing.cardPadding, gap: 4 },
  notInstalledTitle: { ...VelaFont.title(17), color: VelaColor.textPrimary },
  notInstalledText: { ...VelaFont.body(14), color: VelaColor.textSecondary, lineHeight: 20 },
  requestCard: { padding: VelaSpacing.cardPadding, gap: 12 },
  requestOrigin: { ...VelaFont.body(13), color: VelaColor.textSecondary },
  requestMethod: { ...VelaFont.heading(20), color: VelaColor.textPrimary },
  txDetails: { gap: 8, paddingVertical: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { ...VelaFont.body(14), color: VelaColor.textSecondary },
  detailValue: { ...VelaFont.mono(14), color: VelaColor.textPrimary, maxWidth: '60%' },
  errorText: { ...VelaFont.body(13), color: VelaColor.accent },
  buttonRow: { flexDirection: 'row', marginTop: 8 },
});
