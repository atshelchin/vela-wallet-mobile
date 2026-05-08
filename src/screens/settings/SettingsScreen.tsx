import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaButton } from '@/components/ui/VelaButton';
import { ChainLogo } from '@/components/ChainLogo';
import { color, text, inter, space, radius, font, shadow, useStyles } from '@/constants/theme';
import { TEXT_SCALE_LEVELS, useTextScale } from '@/constants/text-scale';
import { useWallet, shortAddress } from '@/models/wallet-state';
import { DEFAULT_NETWORKS, getAllNetworks, refreshCustomNetworks } from '@/models/network';
import type { Network } from '@/models/network';
import { saveNetworkConfig, loadNetworkConfigs, clearAll, loadServiceEndpoints, saveServiceEndpoints, loadPriceSource, savePriceSource, saveCustomNetwork, loadCustomNetworks, removeCustomNetwork, findAccountByCredentialId } from '@/services/storage';
import { getAddresses, getAllNetworkFunding } from '@/services/deployer-api';
import { checkNetworkCompatibility } from '@/services/network-checker';
import { fetchChainInfo } from '@/services/chain-registry';
import { User as UserIcon, Globe as NetworkIcon, Info as InfoIcon, LogOut as LogOutIcon, Check, ChevronRight, ChevronDown, X, Server, Fuel, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react-native';
import type { NetworkConfig, ServiceEndpoints, PriceSource, BundlerDeployerInfo, NetworkFundingStatus, CustomNetwork, CompatibilityResult } from '@/models/types';
import { DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';
import { nativeSymbol } from '@/models/network';
import Animated from 'react-native-reanimated';
import { fadeIn, fadeInDown } from '@/constants/entering';

// All styles in one factory → useStyles recomputes everything on text scale change
type S = ReturnType<typeof styleFactory>;

type IconConfig = { bg: string; fg: string; Icon: React.ComponentType<{ size: number; color: string }> };

function SettingsRow({ s, icon, title, subtitle, showDivider = true, onPress, right }: {
  s: S; icon: IconConfig; title: string; subtitle?: string; showDivider?: boolean; onPress?: () => void; right?: React.ReactNode;
}) {
  return (
    <Pressable style={s.settingsRow} onPress={onPress} disabled={!onPress}>
      <View style={[s.settingsIcon, { backgroundColor: icon.bg }]}>
        <icon.Icon size={16} color={icon.fg} />
      </View>
      <View style={s.settingsRowContent}>
        <Text style={s.settingsRowTitle}>{title}</Text>
        {subtitle ? <Text style={s.settingsRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={16} color={color.fg.subtle} /> : null)}
      {showDivider ? <View style={s.settingsRowDivider} /> : null}
    </Pressable>
  );
}

function NetworkConfigCard({ s, network, savedConfig, onSave, onDelete }: {
  s: S; network: Network; savedConfig?: NetworkConfig;
  onSave: (config: NetworkConfig) => void; onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rpcURL, setRpcURL] = useState(savedConfig?.rpcURL ?? network.rpcURL);
  const [explorerURL, setExplorerURL] = useState(savedConfig?.explorerURL ?? network.explorerURL);
  const [bundlerURL, setBundlerURL] = useState(savedConfig?.bundlerURL ?? network.bundlerURL);

  const handleSave = useCallback(() => {
    onSave({ chainId: network.chainId, rpcURL, explorerURL, bundlerURL });
  }, [network.chainId, rpcURL, explorerURL, bundlerURL, onSave]);

  return (
    <VelaCard style={s.networkCard}>
      <Pressable style={s.networkHeader} onPress={() => setExpanded(!expanded)}>
        <ChainLogo label={network.iconLabel} color={network.iconColor} bgColor={network.iconBg} logoURL={network.logoURL} size={36} />
        <View style={s.networkHeaderText}>
          <Text style={s.networkName}>{network.displayName}</Text>
          <Text style={s.networkChainId}>Chain {network.chainId}</Text>
        </View>
        {onDelete && (
          <Pressable onPress={onDelete} hitSlop={8} style={s.deleteNetBtn}>
            <Trash2 size={14} color={color.fg.subtle} />
          </Pressable>
        )}
        <ChevronRight size={16} color={color.fg.subtle} style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined} />
      </Pressable>
      {expanded && (
        <View style={s.networkFields}>
          <View style={s.dividerFull} />
          {(['RPC URL', 'EXPLORER', 'BUNDLER'] as const).map((label, i) => {
            const vals = [rpcURL, explorerURL, bundlerURL];
            const setters = [setRpcURL, setExplorerURL, setBundlerURL];
            return (
              <View key={label} style={s.configField}>
                <Text style={s.configLabel}>{label}</Text>
                <TextInput style={s.configInput} value={vals[i]} onChangeText={setters[i]} onBlur={handleSave}
                  autoCapitalize="none" autoCorrect={false} placeholder={label} placeholderTextColor={color.fg.subtle} />
              </View>
            );
          })}
        </View>
      )}
    </VelaCard>
  );
}

// ---------------------------------------------------------------------------
// Account Switcher Modal
// ---------------------------------------------------------------------------

function AccountSwitcherModal({ s, visible, onClose }: { s: S; visible: boolean; onClose: () => void }) {
  const { state, dispatch } = useWallet();
  const router = useRouter();
  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={s.modalContainer}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Accounts</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={22} color={color.fg.base} strokeWidth={2} /></Pressable>
        </View>
        <ScrollView style={s.modalScroll} contentContainerStyle={s.modalScrollContent}>
          {state.accounts.map((account, index) => {
            const isActive = index === state.activeAccountIndex;
            return (
              <Pressable key={account.id} style={[s.accountItem, isActive && s.accountItemActive]}
                onPress={() => { dispatch({ type: 'SWITCH_ACCOUNT', index }); onClose(); }}>
                <View style={s.accountAvatar}>
                  <Text style={s.accountAvatarText}>{(account.name[0] ?? 'V').toUpperCase()}</Text>
                </View>
                <View style={s.accountInfo}>
                  <Text style={s.accountNameModal}>{account.name}</Text>
                  <Text style={s.accountAddress}>{shortAddress(account.address)}</Text>
                </View>
                {isActive && <Check size={18} color={color.accent.base} />}
              </Pressable>
            );
          })}
          <View style={s.accountActions}>
            <VelaButton title="Create New Account" onPress={() => { onClose(); router.push('/onboarding'); }} />
            <VelaButton title="Sign In with Existing" variant="secondary" onPress={() => { onClose(); router.push('/onboarding'); }} />
          </View>
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Network Editor Modal (with custom networks)
// ---------------------------------------------------------------------------

function NetworkEditorModal({ s, visible, onClose }: { s: S; visible: boolean; onClose: () => void }) {
  const [savedConfigs, setSavedConfigs] = useState<NetworkConfig[]>([]);
  const [allNetworks, setAllNetworks] = useState<Network[]>(DEFAULT_NETWORKS);
  const [customIds, setCustomIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    loadNetworkConfigs().then(setSavedConfigs);
    getAllNetworks().then(setAllNetworks);
    loadCustomNetworks().then(cn => setCustomIds(new Set(cn.map(c => c.id))));
  }, [visible]);

  const handleSave = useCallback(async (config: NetworkConfig) => {
    await saveNetworkConfig(config);
    setSavedConfigs(await loadNetworkConfigs());
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    Alert.alert('Remove Network', 'Remove this custom network?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await removeCustomNetwork(id);
        await refreshCustomNetworks();
        setAllNetworks(await getAllNetworks());
        setCustomIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      }},
    ]);
  }, []);

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={s.modalContainer}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Networks</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={22} color={color.fg.base} strokeWidth={2} /></Pressable>
        </View>
        <ScrollView style={s.modalScroll} contentContainerStyle={s.networkScrollContent} keyboardShouldPersistTaps="handled">
          {allNetworks.map((network) => (
            <NetworkConfigCard key={network.id} s={s} network={network}
              savedConfig={savedConfigs.find((c) => c.chainId === network.chainId)}
              onSave={handleSave}
              onDelete={customIds.has(network.id) ? () => handleDelete(network.id) : undefined} />
          ))}
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Endpoint Editor Modal
// ---------------------------------------------------------------------------

function EndpointEditorModal({ s, visible, onClose }: { s: S; visible: boolean; onClose: () => void }) {
  const [endpoints, setEndpoints] = useState<ServiceEndpoints>({ ...DEFAULT_SERVICE_ENDPOINTS });
  useEffect(() => { if (visible) loadServiceEndpoints().then(setEndpoints); }, [visible]);

  const handleSave = useCallback(async (field: keyof ServiceEndpoints, value: string) => {
    const updated = { ...endpoints, [field]: value };
    setEndpoints(updated);
    await saveServiceEndpoints(updated);
  }, [endpoints]);

  const fields: { key: keyof ServiceEndpoints; label: string; hint: string }[] = [
    { key: 'ethereumDataURL', label: 'CHAIN DATA INDEX', hint: 'Provides network info, token data, and chain logos' },
    { key: 'passkeyIndexURL', label: 'PASSKEY INDEX', hint: 'Stores public keys for cross-device recovery' },
    { key: 'bundlerServiceURL', label: 'BUNDLER SERVICE', hint: 'Processes ERC-4337 transactions' },
  ];

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={s.modalContainer}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Service Endpoints</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={22} color={color.fg.base} strokeWidth={2} /></Pressable>
        </View>
        <ScrollView style={s.modalScroll} contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled">
          <Text style={s.endpointDescription}>
            These services power your wallet. You can replace them with your own if you prefer full self-custody.
          </Text>
          {fields.map(({ key, label, hint }) => (
            <View key={key} style={s.endpointField}>
              <Text style={s.configLabel}>{label}</Text>
              <Text style={s.endpointHint}>{hint}</Text>
              <TextInput style={s.configInput} value={endpoints[key]}
                onChangeText={(v) => setEndpoints({ ...endpoints, [key]: v })}
                onBlur={() => handleSave(key, endpoints[key])}
                autoCapitalize="none" autoCorrect={false}
                placeholder={DEFAULT_SERVICE_ENDPOINTS[key]} placeholderTextColor={color.fg.subtle} />
            </View>
          ))}
          <Pressable style={s.resetEndpointsBtn} onPress={() => { setEndpoints({ ...DEFAULT_SERVICE_ENDPOINTS }); saveServiceEndpoints({ ...DEFAULT_SERVICE_ENDPOINTS }); }}>
            <Text style={s.resetEndpointsText}>Reset to Defaults</Text>
          </Pressable>
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Bundler/Deployer Modal (per wallet, per network)
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const dotColor = status === 'funded' ? color.success.base : status === 'low_balance' ? '#E8A317' : color.fg.subtle;
  return <View style={[styleStatic.dot, { backgroundColor: dotColor }]} />;
}

const styleStatic = { dot: { width: 8, height: 8, borderRadius: 4 } };

function BundlerDeployerModal({ s, visible, onClose, publicKeyHex }: { s: S; visible: boolean; onClose: () => void; publicKeyHex: string }) {
  const [info, setInfo] = useState<BundlerDeployerInfo | null>(null);
  const [funding, setFunding] = useState<NetworkFundingStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [allNets, setAllNets] = useState<Network[]>(DEFAULT_NETWORKS);

  const loadData = useCallback(async () => {
    if (!publicKeyHex) return;
    setLoading(true);
    try {
      const nets = await getAllNetworks();
      setAllNets(nets);
      const addr = await getAddresses(publicKeyHex);
      setInfo(addr);
      const chainIds = nets.map(n => n.chainId);
      const statuses = await getAllNetworkFunding(addr.bundlerAddress, addr.deployerAddress, chainIds);
      setFunding(statuses);
    } catch {} finally { setLoading(false); }
  }, [publicKeyHex]);

  useEffect(() => { if (visible) loadData(); }, [visible, loadData]);

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={s.modalContainer}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Transaction Services</Text>
          <View style={s.modalHeaderRight}>
            <Pressable onPress={loadData} hitSlop={8} style={s.refreshBtn}>
              <RefreshCw size={18} color={color.fg.muted} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={color.fg.base} strokeWidth={2} /></Pressable>
          </View>
        </View>
        <ScrollView style={s.modalScroll} contentContainerStyle={s.modalScrollContent}>
          {/* Addresses */}
          {info && (
            <View style={s.bdAddresses}>
              <View style={s.bdAddrBox}>
                <Text style={s.bdAddrLabel}>BUNDLER ADDRESS</Text>
                <Text style={s.bdAddrValue} selectable numberOfLines={1}>{info.bundlerAddress}</Text>
              </View>
              <View style={s.bdAddrBox}>
                <Text style={s.bdAddrLabel}>DEPLOYER ADDRESS</Text>
                <Text style={s.bdAddrValue} selectable numberOfLines={1}>{info.deployerAddress}</Text>
              </View>
            </View>
          )}

          <Text style={s.endpointDescription}>
            Fund the Bundler address on each network to enable transactions. Fund the Deployer address to activate new networks. A 15% service fee applies.
          </Text>

          {loading ? (
            <View style={s.loadingRow}><ActivityIndicator size="small" color={color.accent.base} /><Text style={s.loadingText}>Checking balances...</Text></View>
          ) : (
            allNets.map(net => {
              const f = funding.find(f => f.chainId === net.chainId);
              const sym = nativeSymbol(net.chainId);
              return (
                <VelaCard key={net.id} style={s.bdNetworkCard}>
                  <View style={s.bdNetworkRow}>
                    <ChainLogo label={net.iconLabel} color={net.iconColor} bgColor={net.iconBg} logoURL={net.logoURL} size={32} />
                    <Text style={s.bdNetworkName}>{net.displayName}</Text>
                  </View>
                  <View style={s.bdBalanceGrid}>
                    <View style={s.bdBalanceCol}>
                      <Text style={s.bdBalanceLabel}>Bundler</Text>
                      <View style={s.bdBalanceRow}>
                        <StatusDot status={f?.bundlerStatus ?? 'not_funded'} />
                        <Text style={s.bdBalanceValue}>{f?.bundlerBalance ?? '0'} {sym}</Text>
                      </View>
                    </View>
                    <View style={s.bdBalanceCol}>
                      <Text style={s.bdBalanceLabel}>Deployer</Text>
                      <View style={s.bdBalanceRow}>
                        <StatusDot status={f?.deployerStatus ?? 'not_funded'} />
                        <Text style={s.bdBalanceValue}>{f?.deployerBalance ?? '0'} {sym}</Text>
                      </View>
                    </View>
                  </View>
                </VelaCard>
              );
            })
          )}

          <Text style={s.serviceDisclaimer}>
            Funds are consumed as network fees and are not refundable. Self-hosting eliminates the service fee.
          </Text>
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Add Network Modal
// ---------------------------------------------------------------------------

function AddNetworkModal({ s, visible, onClose, onAdded }: { s: S; visible: boolean; onClose: () => void; onAdded: () => void }) {
  const [chainIdInput, setChainIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chainInfo, setChainInfo] = useState<Awaited<ReturnType<typeof fetchChainInfo>> | null>(null);
  const [compatResult, setCompatResult] = useState<CompatibilityResult | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setChainIdInput(''); setChainInfo(null); setCompatResult(null); setError(''); };

  const handleCheck = async () => {
    const cid = parseInt(chainIdInput.trim(), 10);
    if (isNaN(cid) || cid <= 0) { setError('Please enter a valid Chain ID'); return; }

    // Check if already exists
    const existing = DEFAULT_NETWORKS.find(n => n.chainId === cid);
    const custom = await loadCustomNetworks();
    if (existing || custom.find(n => n.chainId === cid)) { setError(`Chain ${cid} is already added`); return; }

    setLoading(true); setError(''); setChainInfo(null); setCompatResult(null);
    try {
      const info = await fetchChainInfo(cid);
      if (!info) { setError(`Chain ${cid} not found in ethereum-data registry`); setLoading(false); return; }
      setChainInfo(info);

      const compat = await checkNetworkCompatibility(info.rpcUrl, cid);
      setCompatResult(compat);
    } catch (e: any) {
      setError(e.message ?? 'Check failed');
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!chainInfo || !compatResult?.compatible) return;
    setSaving(true);
    try {
      const network: CustomNetwork = {
        id: `custom-${chainInfo.chainId}`,
        displayName: chainInfo.name,
        chainId: chainInfo.chainId,
        iconLabel: chainInfo.nativeCurrency.symbol.slice(0, 4),
        iconColor: '#888888',
        iconBg: '#F0F0F0',
        logoURL: chainInfo.logoURL,
        isL2: false,
        rpcURL: chainInfo.rpcUrl,
        explorerURL: chainInfo.explorerUrl,
        bundlerURL: '',
        nativeSymbol: chainInfo.nativeCurrency.symbol,
        addedAt: new Date().toISOString(),
      };
      await saveCustomNetwork(network);
      await refreshCustomNetworks();
      onAdded();
      reset();
      onClose();
    } catch (e: any) { setError(e.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <AppModal visible={visible} onClose={() => { reset(); onClose(); }}>
      <View style={s.modalContainer}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Add Network</Text>
          <Pressable onPress={() => { reset(); onClose(); }} hitSlop={8}><X size={22} color={color.fg.base} strokeWidth={2} /></Pressable>
        </View>
        <ScrollView style={s.modalScroll} contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled">
          <Text style={s.endpointDescription}>
            Enter a Chain ID to check compatibility. The network must have SafeSingletonFactory deployed.
          </Text>

          <View style={s.configField}>
            <Text style={s.configLabel}>CHAIN ID</Text>
            <TextInput style={s.configInput} value={chainIdInput} onChangeText={setChainIdInput}
              placeholder="e.g. 100" placeholderTextColor={color.fg.subtle}
              keyboardType="number-pad" autoFocus />
          </View>

          <VelaButton title="Check Compatibility" onPress={handleCheck} loading={loading} disabled={!chainIdInput.trim()} style={s.checkBtn} />

          {error ? <Text style={s.addNetError}>{error}</Text> : null}

          {chainInfo && (
            <VelaCard style={s.addNetResult}>
              <Text style={s.addNetResultName}>{chainInfo.name}</Text>
              <Text style={s.addNetResultDetail}>Chain ID: {chainInfo.chainId}</Text>
              <Text style={s.addNetResultDetail}>Native: {chainInfo.nativeCurrency.symbol}</Text>
              {chainInfo.explorerUrl ? <Text style={s.addNetResultDetail}>Explorer: {chainInfo.explorerUrl}</Text> : null}
              {chainInfo.isTestnet && <Text style={s.addNetTestnet}>Testnet</Text>}
            </VelaCard>
          )}

          {compatResult && (
            <VelaCard style={s.addNetCompat}>
              <View style={s.addNetCompatRow}>
                {compatResult.factoryDeployed
                  ? <CheckCircle2 size={16} color={color.success.base} strokeWidth={2} />
                  : <XCircle size={16} color={color.accent.base} strokeWidth={2} />}
                <Text style={s.addNetCompatText}>SafeSingletonFactory {compatResult.factoryDeployed ? 'deployed' : 'not found'}</Text>
              </View>
              {compatResult.factoryDeployed && (
                <View style={s.addNetCompatRow}>
                  {compatResult.bytecodeMatch
                    ? <CheckCircle2 size={16} color={color.success.base} strokeWidth={2} />
                    : <XCircle size={16} color={color.accent.base} strokeWidth={2} />}
                  <Text style={s.addNetCompatText}>Bytecode {compatResult.bytecodeMatch ? 'matches' : 'does not match'} ETH mainnet</Text>
                </View>
              )}
              {compatResult.error && !compatResult.compatible && (
                <Text style={s.addNetCompatError}>{compatResult.error}</Text>
              )}
            </VelaCard>
          )}

          {compatResult?.compatible && (
            <VelaButton title="Add Network" onPress={handleAdd} variant="accent" loading={saving} style={s.checkBtn} />
          )}
          {compatResult && !compatResult.compatible && (
            <Text style={s.addNetHint}>
              This network is not compatible yet. Deploy SafeSingletonFactory first via safe-singleton-factory.
            </Text>
          )}
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const styles = useStyles(styleFactory);
  const { state, dispatch, activeAccount } = useWallet();
  const router = useRouter();
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [showNetworkEditor, setShowNetworkEditor] = useState(false);
  const [showEndpointEditor, setShowEndpointEditor] = useState(false);
  const [showBundlerDeployer, setShowBundlerDeployer] = useState(false);
  const [showAddNetwork, setShowAddNetwork] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [priceSource, setPriceSource] = useState<PriceSource>('api');
  const [publicKeyHex, setPublicKeyHex] = useState('');
  const { levelIndex: currentScaleIndex, change: changeTextScale } = useTextScale();

  useEffect(() => { loadPriceSource().then(setPriceSource); }, []);
  useEffect(() => {
    if (activeAccount?.id) {
      findAccountByCredentialId(activeAccount.id).then(stored => {
        if (stored?.publicKeyHex) setPublicKeyHex(stored.publicKeyHex);
      });
    }
  }, [activeAccount?.id]);

  const accountName = activeAccount?.name ?? 'No Wallet';
  const address = activeAccount?.address ?? state.address;

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout? This will clear all local data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await clearAll(); dispatch({ type: 'LOGOUT' }); router.replace('/'); } },
    ]);
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={fadeIn(0, 300)}>
          <Text style={styles.screenTitle}>Settings</Text>
        </Animated.View>

        {/* Account */}
        <Animated.View style={styles.sectionContainer} entering={fadeInDown(50, 300)}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <VelaCard>
            <SettingsRow s={styles} icon={{ bg: color.accent.soft, fg: color.accent.base, Icon: UserIcon }}
              title={accountName} subtitle={address ? shortAddress(address) : 'Switch account'}
              showDivider={false} onPress={() => setShowAccountSwitcher(true)} />
          </VelaCard>
        </Animated.View>

        {/* General */}
        <Animated.View style={styles.sectionContainer} entering={fadeInDown(100, 300)}>
          <Text style={styles.sectionTitle}>GENERAL</Text>
          <VelaCard>
            <View style={styles.textScaleStepper}>
              <Pressable style={[styles.textScaleBtn, currentScaleIndex === 0 && styles.textScaleBtnDisabled]}
                onPress={() => changeTextScale(-1)} disabled={currentScaleIndex === 0}>
                <Text style={[styles.textScaleBtnText, currentScaleIndex === 0 && styles.textScaleBtnTextDisabled]}>A−</Text>
              </Pressable>
              <View style={styles.textScaleTrack}>
                {TEXT_SCALE_LEVELS.map((_, i) => (
                  <View key={i} style={[styles.textScaleTick, i <= currentScaleIndex && styles.textScaleTickActive, i === currentScaleIndex && styles.textScaleTickCurrent]} />
                ))}
              </View>
              <Pressable style={[styles.textScaleBtn, currentScaleIndex === TEXT_SCALE_LEVELS.length - 1 && styles.textScaleBtnDisabled]}
                onPress={() => changeTextScale(1)} disabled={currentScaleIndex === TEXT_SCALE_LEVELS.length - 1}>
                <Text style={[styles.textScaleBtnText, currentScaleIndex === TEXT_SCALE_LEVELS.length - 1 && styles.textScaleBtnTextDisabled]}>A+</Text>
              </Pressable>
            </View>
            <Text style={styles.textScaleLabel}>{TEXT_SCALE_LEVELS[currentScaleIndex].label}</Text>
            <View style={styles.settingsRowDividerFull} />
            <View style={styles.priceSourceRow}>
              <Text style={styles.priceSourceLabel}>Price Source</Text>
              <View style={styles.priceSourceToggle}>
                <Pressable style={[styles.priceSourceOption, priceSource === 'api' && styles.priceSourceOptionActive]}
                  onPress={() => { setPriceSource('api'); savePriceSource('api'); }}>
                  <Text style={[styles.priceSourceText, priceSource === 'api' && styles.priceSourceTextActive]}>API</Text>
                </Pressable>
                <Pressable style={[styles.priceSourceOption, priceSource === 'dex' && styles.priceSourceOptionActive]}
                  onPress={() => { setPriceSource('dex'); savePriceSource('dex'); }}>
                  <Text style={[styles.priceSourceText, priceSource === 'dex' && styles.priceSourceTextActive]}>DEX</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.settingsRowDividerFull} />
            <SettingsRow s={styles} icon={{ bg: color.bg.sunken, fg: color.fg.muted, Icon: InfoIcon }}
              title="About" subtitle="Vela Wallet v1.0.0" showDivider={false} onPress={() => router.push('/about')} />
          </VelaCard>
        </Animated.View>

        {/* Advanced */}
        <Animated.View style={styles.sectionContainer} entering={fadeInDown(150, 300)}>
          <Pressable style={styles.advancedHeader} onPress={() => setShowAdvanced(!showAdvanced)}>
            <Text style={styles.sectionTitle}>ADVANCED</Text>
            <ChevronDown size={14} color={color.fg.subtle} style={showAdvanced ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </Pressable>
          {showAdvanced && (
            <VelaCard>
              <SettingsRow s={styles} icon={{ bg: color.info.soft, fg: color.info.base, Icon: NetworkIcon }}
                title="Networks" subtitle="RPC, Explorer & Bundler URLs"
                showDivider={true} onPress={() => setShowNetworkEditor(true)} />
              <SettingsRow s={styles} icon={{ bg: color.success.soft, fg: color.success.base, Icon: Plus }}
                title="Add Network" subtitle="Add custom EVM network"
                showDivider={true} onPress={() => setShowAddNetwork(true)} />
              <SettingsRow s={styles} icon={{ bg: color.success.soft, fg: color.success.base, Icon: Server }}
                title="Service Endpoints" subtitle="Chain data, identity index, Bundler"
                showDivider={true} onPress={() => setShowEndpointEditor(true)} />
              <SettingsRow s={styles} icon={{ bg: color.accent.soft, fg: color.accent.base, Icon: Fuel }}
                title="Transaction Services" subtitle="Bundler & Deployer per network"
                showDivider={false} onPress={() => setShowBundlerDeployer(true)} />
            </VelaCard>
          )}
        </Animated.View>

        {/* Logout */}
        <Animated.View entering={fadeInDown(200, 300)}>
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <LogOutIcon size={16} color={color.accent.base} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <AccountSwitcherModal s={styles} visible={showAccountSwitcher} onClose={() => setShowAccountSwitcher(false)} />
      <NetworkEditorModal s={styles} visible={showNetworkEditor} onClose={() => setShowNetworkEditor(false)} />
      <EndpointEditorModal s={styles} visible={showEndpointEditor} onClose={() => setShowEndpointEditor(false)} />
      <BundlerDeployerModal s={styles} visible={showBundlerDeployer} onClose={() => setShowBundlerDeployer(false)} publicKeyHex={publicKeyHex} />
      <AddNetworkModal s={styles} visible={showAddNetwork} onClose={() => setShowAddNetwork(false)} onAdded={() => {}} />
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styleFactory = () => ({
  scrollContent: { paddingTop: space.md, paddingBottom: space['5xl'] },
  screenTitle: { fontSize: text['2xl'], ...inter.bold, color: color.fg.base, marginBottom: space['3xl'] },
  sectionContainer: { marginBottom: space['2xl'] },
  sectionTitle: { fontSize: text.sm, ...inter.semibold, color: color.fg.subtle, letterSpacing: 1.2, textTransform: 'uppercase' as const, marginBottom: space.md, paddingHorizontal: space.sm },
  advancedHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingRight: space.md, marginBottom: space.md },

  // Settings Row
  settingsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: space.xl, paddingVertical: space.xl, position: 'relative' as const },
  settingsIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  settingsRowContent: { flex: 1, marginLeft: space.lg, gap: 2 },
  settingsRowTitle: { fontSize: text.lg, ...inter.semibold, color: color.fg.base },
  settingsRowSubtitle: { fontSize: text.sm, ...inter.regular, color: color.fg.subtle },
  settingsRowDivider: { position: 'absolute' as const, bottom: 0, left: 66, right: 0, height: 1, backgroundColor: color.border.base },
  settingsRowDividerFull: { height: 1, backgroundColor: color.border.base, marginHorizontal: space.xl },

  // Logout
  logoutButton: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: space.xl, backgroundColor: color.bg.raised, borderRadius: radius.xl, borderWidth: 1, borderColor: color.border.base, gap: space.md, ...shadow.sm },
  logoutText: { fontSize: text.lg, ...inter.semibold, color: color.accent.base },

  // Text Scale
  textScaleStepper: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: space.lg, paddingHorizontal: space.xl, gap: space.xl },
  textScaleBtn: { width: 40, height: 40, borderRadius: radius.full, borderWidth: 1, borderColor: color.border.base, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: color.bg.base },
  textScaleBtnDisabled: { opacity: 0.3 },
  textScaleBtnText: { fontSize: text.lg, ...inter.bold, color: color.fg.base },
  textScaleBtnTextDisabled: { color: color.fg.subtle },
  textScaleTrack: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, height: 4, backgroundColor: color.border.base, borderRadius: 2, paddingHorizontal: space.sm },
  textScaleTick: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.border.strong },
  textScaleTickActive: { backgroundColor: color.accent.base },
  textScaleTickCurrent: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.accent.base, ...shadow.sm },
  textScaleLabel: { fontSize: text.sm, ...inter.medium, color: color.fg.muted, textAlign: 'center' as const, paddingBottom: space.lg },

  // Modal shared
  modalContainer: { flex: 1, backgroundColor: color.bg.base },
  modalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: space['3xl'], paddingVertical: space.xl, borderBottomWidth: 1, borderBottomColor: color.border.base },
  modalHeaderRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.lg },
  modalTitle: { fontSize: text.xl, ...inter.bold, color: color.fg.base },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: space['3xl'], paddingBottom: space['5xl'] },

  // Account Switcher
  accountItem: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: space.xl, backgroundColor: color.bg.raised, borderRadius: radius.xl, borderWidth: 1, borderColor: color.border.base, marginBottom: space.lg, gap: space.lg, ...shadow.sm },
  accountItemActive: { borderColor: color.accent.base, borderWidth: 1.5 },
  accountAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accent.soft, alignItems: 'center' as const, justifyContent: 'center' as const },
  accountAvatarText: { fontSize: text.lg, ...inter.semibold, color: color.accent.base },
  accountInfo: { flex: 1, gap: 2 },
  accountNameModal: { fontSize: text.lg, ...inter.semibold, color: color.fg.base },
  accountAddress: { fontSize: text.sm, fontWeight: '500' as const, fontFamily: font.mono, color: color.fg.subtle },
  accountActions: { marginTop: space.xl, gap: space.lg },

  // Network Editor
  networkScrollContent: { padding: space.xl, paddingBottom: space['5xl'], gap: space.lg },
  networkCard: { overflow: 'hidden' as const },
  networkHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: space.xl, gap: space.lg },
  networkHeaderText: { flex: 1, gap: 2 },
  networkName: { fontSize: text.lg, ...inter.semibold, color: color.fg.base },
  networkChainId: { fontSize: text.sm, ...inter.regular, color: color.fg.subtle },
  networkFields: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.lg },
  dividerFull: { height: 1, backgroundColor: color.border.base, marginHorizontal: -space.xl, marginBottom: space.sm },
  deleteNetBtn: { padding: space.sm, marginRight: space.sm },
  configField: { gap: space.sm, marginBottom: space.lg },
  configLabel: { fontSize: text.xs, ...inter.semibold, color: color.fg.subtle, letterSpacing: 1, textTransform: 'uppercase' as const },
  configInput: { fontSize: text.sm, fontWeight: '500' as const, fontFamily: font.mono, color: color.fg.base, padding: space.lg, backgroundColor: color.bg.sunken, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border.base },

  // Endpoint Editor
  endpointDescription: { fontSize: text.base, ...inter.regular, color: color.fg.muted, lineHeight: 22, marginBottom: space['2xl'] },
  endpointField: { gap: space.sm, marginBottom: space['2xl'] },
  endpointHint: { fontSize: text.xs, ...inter.regular, color: color.fg.subtle, marginBottom: space.xs },
  resetEndpointsBtn: { alignItems: 'center' as const, paddingVertical: space.xl, marginTop: space.lg },
  resetEndpointsText: { fontSize: text.base, ...inter.semibold, color: color.accent.base },

  // Price Source
  priceSourceRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: space.xl, paddingVertical: space.lg },
  priceSourceLabel: { fontSize: text.base, ...inter.medium, color: color.fg.base },
  priceSourceToggle: { flexDirection: 'row' as const, backgroundColor: color.bg.sunken, borderRadius: radius.lg, padding: 3 },
  priceSourceOption: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.md },
  priceSourceOptionActive: { backgroundColor: color.bg.base, ...shadow.sm },
  priceSourceText: { fontSize: text.sm, ...inter.medium, color: color.fg.muted },
  priceSourceTextActive: { color: color.accent.base, ...inter.semibold },

  // Bundler/Deployer
  refreshBtn: { padding: space.sm },
  bdAddresses: { gap: space.lg, marginBottom: space['2xl'] },
  bdAddrBox: { backgroundColor: color.bg.sunken, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  bdAddrLabel: { fontSize: text.xs, ...inter.semibold, color: color.fg.subtle, letterSpacing: 1, textTransform: 'uppercase' as const },
  bdAddrValue: { fontSize: text.sm, fontWeight: '500' as const, fontFamily: font.mono, color: color.fg.base },
  bdNetworkCard: { padding: space.xl, marginBottom: space.md },
  bdNetworkRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.lg, marginBottom: space.lg },
  bdNetworkName: { fontSize: text.base, ...inter.semibold, color: color.fg.base, flex: 1 },
  bdBalanceGrid: { flexDirection: 'row' as const, gap: space.xl },
  bdBalanceCol: { flex: 1, gap: space.xs },
  bdBalanceLabel: { fontSize: text.xs, ...inter.semibold, color: color.fg.subtle, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  bdBalanceRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  bdBalanceValue: { fontSize: text.sm, fontWeight: '500' as const, fontFamily: font.mono, color: color.fg.base },
  loadingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: space.md, paddingVertical: space['3xl'] },
  loadingText: { fontSize: text.base, ...inter.regular, color: color.fg.muted },
  serviceDisclaimer: { fontSize: text.sm, ...inter.regular, color: color.fg.subtle, lineHeight: 20, marginTop: space.xl, textAlign: 'center' as const },

  // Add Network
  checkBtn: { marginTop: space.lg, marginBottom: space.lg },
  addNetError: { fontSize: text.sm, ...inter.medium, color: color.accent.base, marginTop: space.md },
  addNetResult: { padding: space['2xl'], gap: space.sm, marginBottom: space.lg },
  addNetResultName: { fontSize: text.lg, ...inter.bold, color: color.fg.base },
  addNetResultDetail: { fontSize: text.sm, ...inter.regular, color: color.fg.muted },
  addNetTestnet: { fontSize: text.xs, ...inter.semibold, color: '#E8A317', backgroundColor: '#FFF8E1', paddingHorizontal: space.md, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-start' as const },
  addNetCompat: { padding: space.xl, gap: space.md, marginBottom: space.lg },
  addNetCompatRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  addNetCompatText: { fontSize: text.sm, ...inter.medium, color: color.fg.base },
  addNetCompatError: { fontSize: text.sm, ...inter.regular, color: color.accent.base, marginTop: space.sm },
  addNetHint: { fontSize: text.sm, ...inter.regular, color: color.fg.muted, textAlign: 'center' as const, lineHeight: 20 },
});
