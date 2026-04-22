import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { VelaButton } from '@/components/ui/VelaButton';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useWallet } from '@/models/wallet-state';
import { saveAccount, savePendingUpload } from '@/services/storage';
import { computeAddress } from '@/services/safe-address';
import { extractPublicKey } from '@/services/attestation-parser';
import { fromHex, toHex } from '@/services/hex';
import * as Passkey from '@/modules/passkey';
import { PasskeyError, PasskeyErrorCode } from '@/modules/passkey';

interface Props {
  onCreated?: (address: string, name: string) => void;
  onBack?: () => void;
}

export function CreateWalletScreen({ onCreated, onBack }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const { dispatch } = useWallet();
  const router = useRouter();

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setStatus('');

    try {
      // 1. Check passkey support
      const supported = await Passkey.isSupported();
      if (!supported) {
        Alert.alert('Not Supported', 'Passkeys are not supported on this device.');
        setLoading(false);
        return;
      }

      // 2. Register passkey credential (triggers biometric)
      setStatus('Creating passkey...');
      const registration = await Passkey.register(trimmed);

      // 3. Extract P-256 public key from attestation object
      setStatus('Extracting public key...');
      const attestationBytes = fromHex(registration.attestationObjectHex);
      const pubKey = extractPublicKey(attestationBytes);
      if (!pubKey) {
        throw new Error('Failed to extract public key from attestation');
      }
      const publicKeyHex = '04' + toHex(pubKey.x) + toHex(pubKey.y);

      // 4. Compute deterministic Safe address
      setStatus('Computing wallet address...');
      const address = computeAddress(publicKeyHex);

      // 5. Save account locally
      const account = {
        id: registration.credentialId,
        name: trimmed,
        address,
        publicKeyHex,
        createdAt: new Date().toISOString(),
      };
      await saveAccount(account);

      // 6. Save pending upload for public key index server
      await savePendingUpload({
        id: registration.credentialId,
        name: trimmed,
        publicKeyHex,
        attestationObjectHex: registration.attestationObjectHex,
        createdAt: new Date().toISOString(),
      });

      // 7. Update wallet state and navigate
      dispatch({ type: 'ADD_ACCOUNT', account });
      onCreated?.(address, trimmed);
      router.replace('/(tabs)/wallet');

    } catch (error) {
      if (error instanceof PasskeyError && error.code === PasskeyErrorCode.CANCELLED) {
        // User cancelled — silently return
      } else {
        Alert.alert('Error', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        {onBack && (
          <Text onPress={onBack} style={styles.backButton}>
            Back
          </Text>
        )}
        <Text style={styles.title}>Create Wallet</Text>
        {onBack && <View style={styles.headerSpacer} />}
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Account Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter a name for your account"
          placeholderTextColor={VelaColor.textTertiary}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleCreate}
          editable={!loading}
        />
        <Text style={styles.hint}>
          This name is stored locally and helps you identify your accounts.
        </Text>

        {status ? (
          <Text style={styles.status}>{status}</Text>
        ) : null}
      </View>

      <View style={styles.bottom}>
        <VelaButton
          title="Create with Passkey"
          onPress={handleCreate}
          disabled={!name.trim()}
          loading={loading}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  backButton: {
    ...VelaFont.body(16),
    color: VelaColor.accent,
    position: 'absolute',
    left: 0,
  },
  headerSpacer: {
    width: 40,
  },
  title: {
    ...VelaFont.title(20),
    color: VelaColor.textPrimary,
  },
  content: {
    flex: 1,
    paddingTop: 32,
  },
  label: {
    ...VelaFont.label(14),
    color: VelaColor.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    ...VelaFont.body(17),
    color: VelaColor.textPrimary,
    backgroundColor: VelaColor.bgCard,
    borderWidth: 1,
    borderColor: VelaColor.border,
    borderRadius: VelaRadius.card,
    paddingHorizontal: VelaSpacing.cardPadding,
    paddingVertical: 16,
  },
  hint: {
    ...VelaFont.body(14),
    color: VelaColor.textTertiary,
    marginTop: 12,
    lineHeight: 20,
  },
  status: {
    ...VelaFont.body(14),
    color: VelaColor.blue,
    marginTop: 16,
    textAlign: 'center',
  },
  bottom: {
    paddingBottom: 24,
  },
});
