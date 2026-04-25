import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaButton } from '@/components/ui/VelaButton';
import { ChainLogo } from '@/components/ChainLogo';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { useWallet, shortAddress } from '@/models/wallet-state';
import { DEFAULT_NETWORKS } from '@/models/network';
import { loadAccounts, saveNetworkConfig, loadNetworkConfigs, clearAll } from '@/services/storage';
import { User as UserIcon, Globe as NetworkIcon, Info as InfoIcon, LogOut as LogOutIcon, Check } from 'lucide-react-native';
import type { NetworkConfig } from '@/models/types';

// ---------------------------------------------------------------------------
// Settings Row
// ---------------------------------------------------------------------------

type IconConfig = { bg: string; fg: string; Icon: React.ComponentType<{ size: number; color: string }> };

function SettingsRow({
  icon,
  title,
  subtitle,
  showDivider = true,
  onPress,
}: {
  icon: IconConfig;
  title: string;
  subtitle?: string;
  showDivider?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.settingsIcon, { backgroundColor: icon.bg }]}>
        <icon.Icon size={18} color={icon.fg} />
      </View>
      <View style={styles.settingsRowContent}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.settingsRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
      {showDivider ? <View style={styles.settingsRowDivider} /> : null}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Settings Section
// ---------------------------------------------------------------------------

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <VelaCard>{children}</VelaCard>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Network Config Card (expandable)
// ---------------------------------------------------------------------------

function NetworkConfigCard({
  network,
  savedConfig,
  onSave,
}: {
  network: (typeof DEFAULT_NETWORKS)[0];
  savedConfig?: NetworkConfig;
  onSave: (config: NetworkConfig) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rpcURL, setRpcURL] = useState(savedConfig?.rpcURL ?? network.rpcURL);
  const [explorerURL, setExplorerURL] = useState(savedConfig?.explorerURL ?? network.explorerURL);
  const [bundlerURL, setBundlerURL] = useState(savedConfig?.bundlerURL ?? network.bundlerURL);

  const handleSave = useCallback(() => {
    onSave({ chainId: network.chainId, rpcURL, explorerURL, bundlerURL });
  }, [network.chainId, rpcURL, explorerURL, bundlerURL, onSave]);

  return (
    <VelaCard style={styles.networkCard}>
      <TouchableOpacity
        style={styles.networkHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <ChainLogo
          label={network.iconLabel}
          color={network.iconColor}
          bgColor={network.iconBg}
          size={36}
        />
        <View style={styles.networkHeaderText}>
          <Text style={styles.networkName}>{network.displayName}</Text>
          <Text style={styles.networkChainId}>Chain {network.chainId}</Text>
        </View>
        <Text style={[styles.chevronSmall, expanded && styles.chevronRotated]}>›</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.networkFields}>
          <View style={styles.dividerFull} />
          <ConfigField label="RPC URL" value={rpcURL} onChangeText={setRpcURL} onBlur={handleSave} />
          <ConfigField label="EXPLORER" value={explorerURL} onChangeText={setExplorerURL} onBlur={handleSave} />
          <ConfigField label="BUNDLER" value={bundlerURL} onChangeText={setBundlerURL} onBlur={handleSave} />
        </View>
      )}
    </VelaCard>
  );
}

function ConfigField({
  label,
  value,
  onChangeText,
  onBlur,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
}) {
  return (
    <View style={styles.configField}>
      <Text style={styles.configLabel}>{label}</Text>
      <TextInput
        style={styles.configInput}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={label}
        placeholderTextColor={VelaColor.textTertiary}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Account Switcher Modal
// ---------------------------------------------------------------------------

function AccountSwitcherModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useWallet();
  const router = useRouter();

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Accounts</Text>
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
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={styles.accountAddress}>{shortAddress(account.address)}</Text>
                </View>
                {isActive && <Check size={18} color={VelaColor.accent} />}
              </TouchableOpacity>
            );
          })}

          <View style={styles.accountActions}>
            <VelaButton
              title="Create New Account"
              onPress={() => {
                onClose();
                router.push('/onboarding');
              }}
            />
            <VelaButton
              title="Login with Passkey"
              variant="secondary"
              onPress={() => {
                onClose();
                router.push('/onboarding');
              }}
            />
          </View>
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Language Picker Modal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Network Editor Modal
// ---------------------------------------------------------------------------

function NetworkEditorModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [savedConfigs, setSavedConfigs] = useState<NetworkConfig[]>([]);

  useEffect(() => {
    if (visible) {
      loadNetworkConfigs().then(setSavedConfigs);
    }
  }, [visible]);

  const handleSave = useCallback(async (config: NetworkConfig) => {
    await saveNetworkConfig(config);
    const updated = await loadNetworkConfigs();
    setSavedConfigs(updated);
  }, []);

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Networks</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.networkScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {DEFAULT_NETWORKS.map((network) => {
            const saved = savedConfigs.find((c) => c.chainId === network.chainId);
            return (
              <NetworkConfigCard
                key={network.id}
                network={network}
                savedConfig={saved}
                onSave={handleSave}
              />
            );
          })}
        </ScrollView>
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Main Settings Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const { state, dispatch, activeAccount } = useWallet();
  const router = useRouter();

  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [showNetworkEditor, setShowNetworkEditor] = useState(false);

  const accountName = activeAccount?.name ?? 'No Wallet';
  const address = activeAccount?.address ?? state.address;

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? This will clear all local data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await clearAll();
            dispatch({ type: 'LOGOUT' });
            router.replace('/');
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Text style={styles.screenTitle}>Settings</Text>

        {/* Account Section */}
        <SettingsSection title="Account">
          <SettingsRow
            icon={{ bg: VelaColor.accentSoft, fg: VelaColor.accent, Icon: UserIcon }}
            title={accountName}
            subtitle={address ? shortAddress(address) : 'Switch account'}
            showDivider={false}
            onPress={() => setShowAccountSwitcher(true)}
          />
        </SettingsSection>

        {/* Networks Section */}
        <SettingsSection title="Networks">
          <SettingsRow
            icon={{ bg: VelaColor.blueSoft, fg: VelaColor.blue, Icon: NetworkIcon }}
            title="Networks"
            subtitle="Edit RPC, Explorer & Bundler URLs"
            showDivider={false}
            onPress={() => setShowNetworkEditor(true)}
          />
        </SettingsSection>

        {/* General Section */}
        <SettingsSection title="General">
          <SettingsRow
            icon={{ bg: VelaColor.bgWarm, fg: VelaColor.textSecondary, Icon: InfoIcon }}
            title="About"
            subtitle="Vela Wallet v1.0.0"
            showDivider={false}
          />
        </SettingsSection>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <LogOutIcon size={16} color={VelaColor.accent} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modals */}
      <AccountSwitcherModal
        visible={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
      />
      <NetworkEditorModal
        visible={showNetworkEditor}
        onClose={() => setShowNetworkEditor(false)}
      />
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  screenTitle: {
    ...VelaFont.title(17),
    color: VelaColor.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Settings Section
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...VelaFont.label(11),
    color: VelaColor.textTertiary,
    letterSpacing: 1.5,
    marginBottom: 10,
    paddingHorizontal: 14,
  },

  // Settings Row
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    position: 'relative',
  },
  settingsIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconText: {
    fontSize: 15,
  },
  settingsRowContent: {
    flex: 1,
    marginLeft: 14,
    gap: 1,
  },
  settingsRowTitle: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  settingsRowSubtitle: {
    ...VelaFont.body(12),
    color: VelaColor.textTertiary,
  },
  chevron: {
    fontSize: 18,
    color: VelaColor.textTertiary,
    fontWeight: '500',
  },
  settingsRowDivider: {
    position: 'absolute',
    bottom: 0,
    left: 66,
    right: 0,
    height: 1,
    backgroundColor: VelaColor.border,
  },

  // Logout Button
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: VelaColor.bgCard,
    borderRadius: VelaRadius.card,
    borderWidth: 1,
    borderColor: VelaColor.border,
    gap: 8,
  },
  logoutIcon: {
    fontSize: 15,
    color: VelaColor.accent,
    fontWeight: '700',
  },
  logoutText: {
    ...VelaFont.label(15),
    color: VelaColor.accent,
  },

  // Modal
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

  // Account Switcher
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
  accountName: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  accountAddress: {
    ...VelaFont.mono(12),
    color: VelaColor.textTertiary,
  },
  checkmark: {
    fontSize: 20,
    color: VelaColor.accent,
    fontWeight: '700',
  },
  accountActions: {
    marginTop: 16,
    gap: 10,
  },

  // Language Picker
  languageList: {
    padding: 20,
    gap: 8,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: VelaColor.bgCard,
    borderRadius: VelaRadius.card,
    borderWidth: 1,
    borderColor: VelaColor.border,
    gap: 14,
  },
  languageItemActive: {
    backgroundColor: VelaColor.accentSoft,
    borderColor: VelaColor.accent,
    borderWidth: 1.5,
  },
  languageFlag: {
    fontSize: 24,
  },
  languageName: {
    ...VelaFont.title(16),
    color: VelaColor.textPrimary,
  },
  languageSpacer: {
    flex: 1,
  },
  checkmarkAccent: {
    fontSize: 20,
    color: VelaColor.accent,
    fontWeight: '700',
  },

  // Network Editor
  networkScrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  networkCard: {
    overflow: 'hidden',
  },
  networkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  networkHeaderText: {
    flex: 1,
    gap: 1,
  },
  networkName: {
    ...VelaFont.title(15),
    color: VelaColor.textPrimary,
  },
  networkChainId: {
    ...VelaFont.body(12),
    color: VelaColor.textTertiary,
  },
  chevronSmall: {
    fontSize: 16,
    color: VelaColor.textTertiary,
    fontWeight: '500',
  },
  chevronRotated: {
    transform: [{ rotate: '90deg' }],
  },
  networkFields: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
  },
  dividerFull: {
    height: 1,
    backgroundColor: VelaColor.border,
    marginHorizontal: -16,
    marginBottom: 2,
  },
  configField: {
    gap: 6,
  },
  configLabel: {
    ...VelaFont.label(11),
    color: VelaColor.textTertiary,
    letterSpacing: 1,
  },
  configInput: {
    ...VelaFont.mono(12),
    color: VelaColor.textPrimary,
    padding: 12,
    backgroundColor: VelaColor.bgWarm,
    borderRadius: VelaRadius.cardSmall,
  },
});
