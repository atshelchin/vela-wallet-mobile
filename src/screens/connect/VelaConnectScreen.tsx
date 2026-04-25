import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { useWallet, shortAddress } from '@/models/wallet-state';
import { chainName, nativeSymbol, DEFAULT_NETWORKS } from '@/models/network';
import { shortAddr, type BLEIncomingRequest } from '@/models/types';
import * as BLE from '@/modules/ble';
import * as Passkey from '@/modules/passkey';
import { sendNative, sendContractCall } from '@/services/safe-transaction';
import { findAccountByCredentialId } from '@/services/storage';
import { keccak256 } from '@/services/eth-crypto';
import { derSignatureToRaw } from '@/services/attestation-parser';
import { fromHex, toHex, stripHexPrefix } from '@/services/hex';
import * as PublicKeyIndex from '@/services/public-key-index';
import { rpcCall } from '@/services/rpc-adapter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectState = 'idle' | 'advertising' | 'connected';

// ---------------------------------------------------------------------------
// Helper: method display name
// ---------------------------------------------------------------------------

function methodDisplayName(method: string): string {
  switch (method) {
    case 'eth_sendTransaction':
      return 'Transaction';
    case 'personal_sign':
      return 'Sign Message';
    case 'eth_signTypedData_v4':
      return 'Sign Typed Data';
    case 'eth_requestAccounts':
      return 'Connect';
    default:
      return method;
  }
}

// ---------------------------------------------------------------------------
// Step Row (for idle instructions)
// ---------------------------------------------------------------------------

function StepRow({ number, text }: { number: number; text: string }) {
  return (
    <VelaCard style={styles.stepCard}>
      <View style={styles.stepRow}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{number}</Text>
        </View>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </VelaCard>
  );
}

// ---------------------------------------------------------------------------
// Account Picker (inline dropdown)
// ---------------------------------------------------------------------------

function AccountPickerButton({
  onPress,
  name,
}: {
  onPress: () => void;
  name: string;
}) {
  return (
    <TouchableOpacity style={styles.accountPicker} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.accountPickerText} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.accountPickerChevron}>▾</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Account Picker Modal
// ---------------------------------------------------------------------------

function AccountPickerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useWallet();

  return (
    <AppModal visible={visible}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Account</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
          {state.accounts.map((account, index) => {
            const isActive = index === state.activeAccountIndex;
            return (
              <TouchableOpacity
                key={account.id}
                style={[styles.accountItem, isActive && styles.accountItemActive]}
                onPress={() => {
                  dispatch({ type: 'SWITCH_ACCOUNT', index });
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.accountAvatar}>
                  <Text style={styles.accountAvatarText}>
                    {(account.name[0] ?? 'V').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountNameText}>{account.name}</Text>
                  <Text style={styles.accountAddressText}>{shortAddress(account.address)}</Text>
                </View>
                {isActive && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Transaction Detail Row
// ---------------------------------------------------------------------------

function TxDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.txDetailRow}>
      <Text style={styles.txDetailLabel}>{label}</Text>
      <Text style={styles.txDetailValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Connect Screen
// ---------------------------------------------------------------------------

export default function VelaConnectScreen() {
  const { state, dispatch, activeAccount } = useWallet();

  const [bleAvailable, setBleAvailable] = useState<boolean | null>(null);
  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [connectedCentralId, setConnectedCentralId] = useState<string | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<BLEIncomingRequest | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [currentChainId, setCurrentChainId] = useState(1);

  // Refs for auto-reply so the BLE listener always sees current values
  const addressRef = useRef(activeAccount?.address ?? state.address);
  const chainIdRef = useRef(currentChainId);
  useEffect(() => { addressRef.current = activeAccount?.address ?? state.address; }, [activeAccount, state.address]);
  useEffect(() => { chainIdRef.current = currentChainId; }, [currentChainId]);

  const unsubscribersRef = useRef<(() => void)[]>([]);

  const accountName = activeAccount?.name ?? 'Wallet';
  const address = activeAccount?.address ?? state.address;

  // Check BLE availability on mount
  useEffect(() => {
    BLE.isSupported()
      .then(setBleAvailable)
      .catch(() => setBleAvailable(false));
  }, []);

  // Subscribe to BLE events
  useEffect(() => {
    if (bleAvailable !== true) return;

    try {
      const unsubs: (() => void)[] = [];

      unsubs.push(
        BLE.addListener('centralConnected', (data) => {
          setConnectState('connected');
          setConnectedCentralId(data.centralId);
        }),
      );

      unsubs.push(
        BLE.addListener('centralDisconnected', () => {
          setConnectState('advertising');
          setConnectedCentralId(null);
          setIncomingRequest(null);
        }),
      );

      unsubs.push(
        BLE.addListener('requestReceived', (data) => {
          const { id, method, params } = data;
          const addr = addressRef.current;
          const cid = chainIdRef.current;

          console.log('[BLE] ←', method, id.slice(0, 8));

          // --- Signing methods: need user approval ---
          if (method === 'eth_sendTransaction' ||
              method === 'personal_sign' ||
              method === 'eth_sign' ||
              method.includes('signTypedData')) {
            setIncomingRequest({
              id: data.id,
              method: data.method,
              params: data.params,
              origin: data.origin,
              favicon: data.favicon,
            });
            return;
          }

          // --- Everything else: auto-reply immediately ---
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts':
              BLE.sendResponse(id, [addr]).catch(() => {});
              return;
            case 'eth_chainId':
              BLE.sendResponse(id, '0x' + cid.toString(16)).catch(() => {});
              return;
            case 'net_version':
              BLE.sendResponse(id, String(cid)).catch(() => {});
              return;
            case 'wallet_getPermissions':
            case 'wallet_requestPermissions':
              BLE.sendResponse(id, [{ parentCapability: 'eth_accounts' }]).catch(() => {});
              return;
            case 'wallet_switchEthereumChain': {
              const cp = params?.[0] as { chainId?: string } | undefined;
              if (cp?.chainId) {
                const nc = parseInt(cp.chainId, 16);
                if (!isNaN(nc)) { chainIdRef.current = nc; setCurrentChainId(nc); }
              }
              BLE.sendResponse(id, null).catch(() => {});
              return;
            }
            case 'wallet_addEthereumChain':
              BLE.sendResponse(id, null).catch(() => {});
              return;
            default:
              // Forward any other RPC method to the proxy
              // This covers eth_call, eth_getBalance, eth_blockNumber,
              // multicall, eth_getLogs, and any UniSwap-specific queries
              rpcCall(method, params ?? [], cid)
                .then((res) => {
                  BLE.sendResponse(id, res.result ?? res.error ?? null).catch(() => {});
                })
                .catch(() => {
                  BLE.sendResponse(id, undefined, { code: -32603, message: `RPC failed: ${method}` }).catch(() => {});
                });
              return;
          }
        }),
      );

      unsubs.push(
        BLE.addListener('advertisingStopped', () => {
          setConnectState('idle');
          setConnectedCentralId(null);
          setIncomingRequest(null);
        }),
      );

      unsubs.push(
        BLE.addListener('error', (data) => {
          Alert.alert('BLE Error', data.message);
        }),
      );

      unsubscribersRef.current = unsubs;

      return () => {
        unsubs.forEach((fn) => fn());
      };
    } catch {
      // Native module not available for event subscription
      return undefined;
    }
  }, [bleAvailable]);

  // Update wallet info when account changes while advertising/connected
  useEffect(() => {
    if (connectState !== 'idle' && bleAvailable) {
      BLE.updateWalletInfo({
        walletAddress: address,
        accountName,
        chainId: currentChainId,
        accounts: state.accounts.map((a) => ({ name: a.name, address: a.address })),
      }).catch(() => {});
    }
  }, [address, accountName, connectState, bleAvailable, currentChainId, state.accounts]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const startAdvertising = useCallback(async () => {
    try {
      const granted = await BLE.requestPermissions();
      if (!granted) {
        Alert.alert('Permission Required', 'Bluetooth permission is needed for Vela Connect.');
        return;
      }

      await BLE.startAdvertising({
        walletAddress: address,
        accountName,
        chainId: currentChainId,
        accounts: state.accounts.map((a) => ({ name: a.name, address: a.address })),
      });

      setConnectState('advertising');
    } catch (err: any) {
      Alert.alert('BLE Error', err.message ?? 'Failed to start advertising.');
    }
  }, [address, accountName, currentChainId, state.accounts]);

  const stopAdvertising = useCallback(async () => {
    try {
      await BLE.stopAdvertising();
    } catch {
      // Ignore errors on stop
    }
    setConnectState('idle');
    setConnectedCentralId(null);
    setIncomingRequest(null);
  }, []);

  // --- personal_sign ---
  async function handlePersonalSign(request: BLEIncomingRequest): Promise<string> {
    const credentialId = activeAccount?.id;
    const hexMsg = request.params[0] as string;
    const clean = stripHexPrefix(hexMsg);
    const msgBytes = fromHex(clean);

    // Ethereum personal sign prefix
    const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
    const combined = new Uint8Array(prefix.length + msgBytes.length);
    combined.set(prefix);
    combined.set(msgBytes, prefix.length);
    const dataToSign = keccak256(combined);

    const assertion = await Passkey.sign(toHex(dataToSign), credentialId);
    const rawSig = derSignatureToRaw(fromHex(assertion.signatureHex));
    if (!rawSig) throw new Error('Failed to convert signature');

    return '0x' + toHex(rawSig) + '00';
  }

  // --- eth_signTypedData_v4 ---
  async function handleSignTypedData(request: BLEIncomingRequest): Promise<string> {
    const credentialId = activeAccount?.id;
    // Hash the typed data params
    const jsonStr = JSON.stringify(request.params);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const dataToSign = keccak256(jsonBytes);

    const assertion = await Passkey.sign(toHex(dataToSign), credentialId);
    const rawSig = derSignatureToRaw(fromHex(assertion.signatureHex));
    if (!rawSig) throw new Error('Failed to convert signature');

    return '0x' + toHex(rawSig) + '00';
  }

  // --- eth_sendTransaction (full ERC-4337 UserOp) ---
  async function handleSendTransaction(request: BLEIncomingRequest): Promise<string> {
    const txDict = request.params[0] as Record<string, string>;
    const to = txDict.to ?? '';
    const valueHex = txDict.value ?? '0x0';
    const dataHex = txDict.data ?? '0x';
    const chainId = chainIdRef.current; // use ref, not stale state

    // Get public key
    const credentialId = activeAccount?.id ?? '';
    let publicKeyHex: string | undefined;

    const stored = await findAccountByCredentialId(credentialId);
    publicKeyHex = stored?.publicKeyHex;

    if (!publicKeyHex) {
      // Try server recovery
      const record = await PublicKeyIndex.queryRecord(Passkey.RELYING_PARTY, credentialId);
      publicKeyHex = record.publicKey;
    }

    if (!publicKeyHex) throw new Error('Public key not found');

    // Build signFn
    const signFn = async (challenge: Uint8Array) => {
      const assertion = await Passkey.sign(toHex(challenge), credentialId);
      return {
        signature: fromHex(assertion.signatureHex),
        authenticatorData: fromHex(assertion.authenticatorDataHex),
        clientDataJSON: fromHex(assertion.clientDataJSONHex),
      };
    };

    const valueClean = stripHexPrefix(valueHex) || '0';

    let txResult;
    if (dataHex === '0x' || dataHex === '') {
      txResult = await sendNative(state.address, to, valueClean, chainId, publicKeyHex, signFn);
    } else {
      const txData = fromHex(stripHexPrefix(dataHex));
      txResult = await sendContractCall(state.address, to, valueClean, txData, chainId, publicKeyHex, signFn);
    }

    return txResult.txHash;
  }

  // --- generic sign ---
  async function handleGenericSign(request: BLEIncomingRequest): Promise<string> {
    const credentialId = activeAccount?.id;
    const jsonStr = JSON.stringify(request.params);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const dataToSign = keccak256(jsonBytes);

    const assertion = await Passkey.sign(toHex(dataToSign), credentialId);
    return '0x' + assertion.signatureHex;
  }

  const approveRequest = useCallback(
    async (request: BLEIncomingRequest) => {
      setIsSigning(true);
      setSignError(null);
      try {
        let resultValue: any;

        if (request.method === 'eth_sendTransaction') {
          resultValue = await handleSendTransaction(request);
        } else if (request.method === 'personal_sign') {
          resultValue = await handlePersonalSign(request);
        } else if (request.method.includes('signTypedData')) {
          resultValue = await handleSignTypedData(request);
        } else {
          resultValue = await handleGenericSign(request);
        }

        await BLE.sendResponse(request.id, resultValue);
        setIncomingRequest(null);
      } catch (err: any) {
        if (err?.code === 'PASSKEY_CANCELLED') {
          // User cancelled biometric — don't send error to dApp, just reset
          setIsSigning(false);
          return;
        }
        setSignError(err.message ?? 'Signing failed');
        try {
          await BLE.sendResponse(request.id, undefined, {
            code: -32603,
            message: err.message ?? 'Internal error',
          });
        } catch {}
        setIncomingRequest(null);
      } finally {
        setIsSigning(false);
      }
    },
    [state, activeAccount],
  );

  const rejectRequest = useCallback(async (request: BLEIncomingRequest) => {
    try {
      await BLE.sendResponse(request.id, undefined, {
        code: 4001,
        message: 'User rejected',
      });
    } catch {
      // Ignore errors
    }
    setIncomingRequest(null);
  }, []);

  // ---------------------------------------------------------------------------
  // BLE Not Available
  // ---------------------------------------------------------------------------

  if (bleAvailable === false) {
    return (
      <ScreenContainer>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>DApps</Text>
        </View>
        <View style={styles.centerContent}>
          <View style={styles.unavailableIcon}>
            <Text style={styles.unavailableIconText}>📡</Text>
          </View>
          <Text style={styles.unavailableTitle}>BLE Not Available</Text>
          <Text style={styles.unavailableDesc}>
            Bluetooth Low Energy peripheral mode is not available on this device. Rebuild the app
            with the native BLE module to enable Vela Connect.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // Loading state
  if (bleAvailable === null) {
    return (
      <ScreenContainer>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>DApps</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={VelaColor.blue} />
        </View>
      </ScreenContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Request View
  // ---------------------------------------------------------------------------

  if (incomingRequest) {
    const request = incomingRequest;
    let valueEth = 0;
    let toAddr = '';
    let hasContractData = false;

    if (request.method === 'eth_sendTransaction' && request.params[0]) {
      const tx = request.params[0] as Record<string, any>;
      toAddr = (tx.to as string) ?? '';
      const valueHex = (tx.value as string) ?? '0x0';
      const cleanHex = valueHex.startsWith('0x') ? valueHex.slice(2) : valueHex;
      const valueWei = parseInt(cleanHex, 16) || 0;
      valueEth = valueWei / 1e18;
      const dataField = (tx.data as string) ?? '0x';
      hasContractData = dataField !== '0x' && dataField !== '';
    }

    return (
      <ScreenContainer>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>DApps</Text>
          <AccountPickerButton
            name={accountName}
            onPress={() => setShowAccountPicker(true)}
          />
        </View>

        <View style={styles.requestContainer}>
          {/* Origin */}
          <View style={styles.originRow}>
            {request.favicon ? (
              <View style={styles.faviconPlaceholder} />
            ) : null}
            <Text style={styles.originText} numberOfLines={1}>
              {request.origin}
            </Text>
          </View>

          {/* Request Card */}
          <VelaCard style={styles.requestCard}>
            <View style={styles.requestMethodRow}>
              <Text style={styles.requestMethodLabel}>
                {methodDisplayName(request.method).toUpperCase()}
              </Text>
              <View style={styles.chainBadge}>
                <Text style={styles.chainBadgeText}>{chainName(currentChainId)}</Text>
              </View>
            </View>

            {request.method === 'eth_sendTransaction' ? (
              <>
                {valueEth > 0 && (
                  <Text style={styles.txValue}>
                    {valueEth.toFixed(6)} {nativeSymbol(currentChainId)}
                  </Text>
                )}
                {hasContractData && (
                  <Text style={styles.txContractLabel}>Contract Interaction</Text>
                )}
                <View style={styles.txDivider} />
                <TxDetailRow label="To" value={shortAddr(toAddr)} />
                <TxDetailRow label="From" value={shortAddr(address)} />
                <TxDetailRow label="Network" value={chainName(currentChainId)} />
              </>
            ) : (
              <Text style={styles.requestMethodTitle}>
                {methodDisplayName(request.method)}
              </Text>
            )}
          </VelaCard>

          {signError ? (
            <Text style={styles.errorText}>{signError}</Text>
          ) : null}

          <View style={styles.requestSpacer} />

          {/* Action buttons */}
          <View style={styles.requestActions}>
            <VelaButton
              title={isSigning ? 'Signing...' : 'Approve'}
              variant="accent"
              onPress={() => approveRequest(request)}
              disabled={isSigning}
              loading={isSigning}
            />
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => rejectRequest(request)}
              activeOpacity={0.7}
            >
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>

        <AccountPickerModal
          visible={showAccountPicker}
          onClose={() => setShowAccountPicker(false)}
        />
      </ScreenContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Connected State
  // ---------------------------------------------------------------------------

  if (connectState === 'connected') {
    return (
      <ScreenContainer>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>DApps</Text>
          <AccountPickerButton
            name={accountName}
            onPress={() => setShowAccountPicker(true)}
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.connectedContent}
        >
          {/* Device card */}
          <View style={styles.deviceCard}>
            <View style={styles.deviceIcon}>
              <Text style={styles.deviceIconText}>🖥</Text>
            </View>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>Chrome — Vela Connect</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Connected</Text>
              </View>
            </View>
          </View>

          {/* Current wallet info */}
          <View style={styles.walletInfoCard}>
            <View style={styles.walletAvatar}>
              <Text style={styles.walletAvatarText}>
                {accountName[0]?.toUpperCase() ?? 'V'}
              </Text>
            </View>
            <View style={styles.walletInfoText}>
              <Text style={styles.walletInfoName}>{accountName}</Text>
              <Text style={styles.walletInfoAddress}>{shortAddress(address)}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAccountPicker(true)}>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.connectedSpacer} />

          {/* Connected status */}
          <View style={styles.connectedStatusCenter}>
            <View style={styles.connectedCheckIcon}>
              <Text style={styles.connectedCheckText}>✓</Text>
            </View>
            <Text style={styles.connectedTitle}>Connected</Text>
            <Text style={styles.connectedDesc}>
              Your wallet is connected to the Chrome extension. Sign transactions and messages
              directly from your phone.
            </Text>
          </View>

          <View style={styles.connectedSpacer} />
        </ScrollView>

        <View style={styles.bottomAction}>
          <TouchableOpacity style={styles.disconnectButton} onPress={stopAdvertising} activeOpacity={0.7}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>

        <AccountPickerModal
          visible={showAccountPicker}
          onClose={() => setShowAccountPicker(false)}
        />
      </ScreenContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Advertising State
  // ---------------------------------------------------------------------------

  if (connectState === 'advertising') {
    return (
      <ScreenContainer>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>DApps</Text>
          <AccountPickerButton
            name={accountName}
            onPress={() => setShowAccountPicker(true)}
          />
        </View>

        <View style={styles.centerContent}>
          <View style={styles.advertisingRings}>
            <View style={styles.ring3} />
            <View style={styles.ring2} />
            <View style={styles.ring1}>
              <Text style={styles.bleIcon}>📡</Text>
            </View>
          </View>

          <Text style={styles.advertisingTitle}>Waiting for connection...</Text>
          <Text style={styles.advertisingDesc}>
            Open the Vela Connect extension in Chrome and click "Connect" to pair with this device.
          </Text>

          {/* Current wallet badge */}
          <View style={styles.advertisingWalletCard}>
            <View style={styles.walletAvatarSmall}>
              <Text style={styles.walletAvatarSmallText}>
                {accountName[0]?.toUpperCase() ?? 'V'}
              </Text>
            </View>
            <View style={styles.advertisingWalletInfo}>
              <Text style={styles.advertisingWalletName}>{accountName}</Text>
              <Text style={styles.advertisingWalletAddr}>{shortAddress(address)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomAction}>
          <TouchableOpacity style={styles.disconnectButton} onPress={stopAdvertising} activeOpacity={0.7}>
            <Text style={styles.disconnectText}>Stop</Text>
          </TouchableOpacity>
        </View>

        <AccountPickerModal
          visible={showAccountPicker}
          onClose={() => setShowAccountPicker(false)}
        />
      </ScreenContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Idle State
  // ---------------------------------------------------------------------------

  return (
    <ScreenContainer>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>DApps</Text>
        <AccountPickerButton
          name={accountName}
          onPress={() => setShowAccountPicker(true)}
        />
      </View>

      <View style={styles.centerContent}>
        {/* BLE icon with rings */}
        <View style={styles.idleIconContainer}>
          <View style={styles.idleRing3} />
          <View style={styles.idleRing2} />
          <View style={styles.idleRing1}>
            <Text style={styles.idleBleIcon}>📡</Text>
          </View>
        </View>

        <Text style={styles.idleTitle}>Vela Connect</Text>
        <Text style={styles.idleDesc}>
          Connect your wallet to the Vela Connect Chrome extension via Bluetooth to sign
          transactions on desktop.
        </Text>

        <View style={styles.stepsContainer}>
          <StepRow number={1} text="Install the Vela Connect extension in Chrome" />
          <StepRow number={2} text='Tap "Start Pairing" below to begin advertising' />
          <StepRow number={3} text="Click Connect in the extension to pair" />
        </View>
      </View>

      <View style={styles.bottomAction}>
        <TouchableOpacity style={styles.pairButton} onPress={startAdvertising} activeOpacity={0.85}>
          <Text style={styles.pairButtonIcon}>📡</Text>
          <Text style={styles.pairButtonText}>Start Pairing</Text>
        </TouchableOpacity>
      </View>

      <AccountPickerModal
        visible={showAccountPicker}
        onClose={() => setShowAccountPicker(false)}
      />
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Header bar
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  headerTitle: {
    ...VelaFont.title(17),
    color: VelaColor.textPrimary,
  },

  // Account picker capsule
  accountPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: VelaColor.bgWarm,
    borderRadius: VelaRadius.full,
    gap: 4,
  },
  accountPickerText: {
    ...VelaFont.label(12),
    color: VelaColor.textPrimary,
    maxWidth: 100,
  },
  accountPickerChevron: {
    fontSize: 9,
    color: VelaColor.textTertiary,
    fontWeight: '600',
  },

  // Center content
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  // Bottom action
  bottomAction: {
    paddingHorizontal: 4,
    paddingBottom: 24,
  },

  // ---------------------------------------------------------------------------
  // BLE Unavailable
  // ---------------------------------------------------------------------------
  unavailableIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: VelaColor.bgWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  unavailableIconText: {
    fontSize: 32,
  },
  unavailableTitle: {
    ...VelaFont.heading(20),
    color: VelaColor.textPrimary,
    marginBottom: 10,
  },
  unavailableDesc: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },

  // ---------------------------------------------------------------------------
  // Idle State
  // ---------------------------------------------------------------------------
  idleIconContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  idleRing3: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(66, 103, 244, 0.06)',
  },
  idleRing2: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1.5,
    borderColor: 'rgba(66, 103, 244, 0.12)',
  },
  idleRing1: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: VelaColor.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleBleIcon: {
    fontSize: 32,
  },
  idleTitle: {
    ...VelaFont.heading(24),
    color: VelaColor.textPrimary,
    marginBottom: 10,
  },
  idleDesc: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  stepsContainer: {
    width: '100%',
    gap: 12,
  },
  stepCard: {
    overflow: 'hidden',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: VelaColor.bgWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    ...VelaFont.label(12),
    color: VelaColor.textSecondary,
  },
  stepText: {
    ...VelaFont.body(14),
    color: VelaColor.textPrimary,
    flex: 1,
    lineHeight: 20,
  },

  // Pair button (blue)
  pairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    backgroundColor: VelaColor.blue,
    borderRadius: VelaRadius.button,
    gap: 8,
  },
  pairButtonIcon: {
    fontSize: 16,
  },
  pairButtonText: {
    ...VelaFont.label(16),
    color: '#FFFFFF',
  },

  // ---------------------------------------------------------------------------
  // Advertising State
  // ---------------------------------------------------------------------------
  advertisingRings: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  ring3: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: 'rgba(66, 103, 244, 0.1)',
  },
  ring2: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(66, 103, 244, 0.15)',
  },
  ring1: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: VelaColor.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bleIcon: {
    fontSize: 28,
  },
  advertisingTitle: {
    ...VelaFont.heading(20),
    color: VelaColor.textPrimary,
    marginBottom: 8,
  },
  advertisingDesc: {
    ...VelaFont.body(13),
    color: VelaColor.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  advertisingWalletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: VelaColor.bgWarm,
    borderRadius: VelaRadius.cardSmall,
    gap: 10,
    alignSelf: 'stretch',
  },
  walletAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: VelaColor.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletAvatarSmallText: {
    ...VelaFont.label(12),
    color: VelaColor.accent,
  },
  advertisingWalletInfo: {
    flex: 1,
    gap: 1,
  },
  advertisingWalletName: {
    ...VelaFont.title(13),
    color: VelaColor.textPrimary,
  },
  advertisingWalletAddr: {
    ...VelaFont.mono(11),
    color: VelaColor.textTertiary,
  },

  // Disconnect / Stop button
  disconnectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderRadius: VelaRadius.button,
    borderWidth: 1.5,
    borderColor: VelaColor.accent,
  },
  disconnectText: {
    ...VelaFont.label(16),
    color: VelaColor.accent,
  },

  // ---------------------------------------------------------------------------
  // Connected State
  // ---------------------------------------------------------------------------
  connectedContent: {
    paddingBottom: 24,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: VelaColor.bgCard,
    borderRadius: VelaRadius.card,
    borderWidth: 1.5,
    borderColor: '#D4DDFF',
    gap: 14,
    marginTop: 16,
  },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: VelaColor.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIconText: {
    fontSize: 20,
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: VelaColor.green,
  },
  statusText: {
    ...VelaFont.label(12),
    color: VelaColor.green,
  },

  walletInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: VelaColor.bgWarm,
    borderRadius: VelaRadius.cardSmall,
    gap: 12,
    marginTop: 12,
  },
  walletAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: VelaColor.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletAvatarText: {
    ...VelaFont.label(14),
    color: VelaColor.accent,
  },
  walletInfoText: {
    flex: 1,
    gap: 2,
  },
  walletInfoName: {
    ...VelaFont.title(14),
    color: VelaColor.textPrimary,
  },
  walletInfoAddress: {
    ...VelaFont.mono(12),
    color: VelaColor.textTertiary,
  },
  changeText: {
    ...VelaFont.label(12),
    color: VelaColor.accent,
  },

  connectedSpacer: {
    height: 40,
  },
  connectedStatusCenter: {
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  connectedCheckIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: VelaColor.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  connectedCheckText: {
    fontSize: 26,
    fontWeight: '600',
    color: VelaColor.green,
  },
  connectedTitle: {
    ...VelaFont.heading(22),
    color: VelaColor.textPrimary,
    marginBottom: 8,
  },
  connectedDesc: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ---------------------------------------------------------------------------
  // Request View
  // ---------------------------------------------------------------------------
  requestContainer: {
    flex: 1,
    paddingTop: 8,
  },
  originRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  faviconPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: VelaColor.bgWarm,
  },
  originText: {
    ...VelaFont.title(13),
    color: VelaColor.textPrimary,
  },
  requestCard: {
    overflow: 'hidden',
    padding: 0,
  },
  requestMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  requestMethodLabel: {
    ...VelaFont.label(10),
    color: VelaColor.textTertiary,
    letterSpacing: 1,
  },
  chainBadge: {
    backgroundColor: VelaColor.blueSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VelaRadius.full,
  },
  chainBadgeText: {
    ...VelaFont.label(10),
    color: VelaColor.blue,
  },
  txValue: {
    ...VelaFont.heading(24),
    color: VelaColor.textPrimary,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  txContractLabel: {
    ...VelaFont.title(14),
    color: VelaColor.textSecondary,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  txDivider: {
    height: 1,
    backgroundColor: VelaColor.border,
  },
  requestMethodTitle: {
    ...VelaFont.heading(20),
    color: VelaColor.textPrimary,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  errorText: {
    ...VelaFont.body(13),
    color: VelaColor.accent,
    textAlign: 'center',
    marginTop: 12,
  },
  requestSpacer: {
    flex: 1,
  },
  requestActions: {
    gap: 10,
    paddingBottom: 24,
  },
  rejectButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  rejectButtonText: {
    ...VelaFont.label(14),
    color: VelaColor.textSecondary,
  },

  // Transaction detail row
  txDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: VelaColor.border,
  },
  txDetailLabel: {
    ...VelaFont.body(12),
    color: VelaColor.textTertiary,
  },
  txDetailValue: {
    ...VelaFont.mono(12),
    color: VelaColor.textPrimary,
  },

  // ---------------------------------------------------------------------------
  // Modal (Account Picker)
  // ---------------------------------------------------------------------------
  modalContainer: {
    flex: 1,
    backgroundColor: VelaColor.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: VelaSpacing.screenH,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: VelaColor.border,
  },
  modalTitle: {
    ...VelaFont.title(17),
    color: VelaColor.textPrimary,
  },
  modalClose: {
    ...VelaFont.label(15),
    color: VelaColor.accent,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: VelaSpacing.screenH,
    paddingBottom: 40,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: VelaColor.bgCard,
    borderRadius: VelaRadius.card,
    borderWidth: 1,
    borderColor: VelaColor.border,
    marginBottom: 10,
    gap: 14,
  },
  accountItemActive: {
    borderColor: VelaColor.accent,
    borderWidth: 1.5,
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: VelaColor.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarText: {
    ...VelaFont.label(16),
    color: VelaColor.accent,
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountNameText: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  accountAddressText: {
    ...VelaFont.mono(12),
    color: VelaColor.textTertiary,
  },
  checkmark: {
    fontSize: 20,
    color: VelaColor.accent,
    fontWeight: '700',
  },
});
