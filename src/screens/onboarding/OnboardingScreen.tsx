import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { WelcomeScreen } from './WelcomeScreen';
import { CreateWalletScreen } from './CreateWalletScreen';
import { useWallet } from '@/models/wallet-state';
import { loadAccounts, saveAccount } from '@/services/storage';
import { fromHex } from '@/services/hex';
import { computeAddress } from '@/services/safe-address';
import * as Passkey from '@/modules/passkey';
import { PasskeyError, PasskeyErrorCode } from '@/modules/passkey';
import * as PublicKeyIndex from '@/services/public-key-index';
import * as CloudSync from '@/modules/cloud-sync';
import type { StoredAccount } from '@/models/types';

type Step = 'welcome' | 'create';

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>('welcome');
  const [loginLoading, setLoginLoading] = useState(false);
  const router = useRouter();
  const { dispatch } = useWallet();

  async function handleLogin() {
    try {
      setLoginLoading(true);

      const supported = await Passkey.isSupported();
      if (!supported) {
        Alert.alert('Not Supported', 'Passkeys are not supported on this device.');
        return;
      }

      // 1. Authenticate with existing passkey
      const assertion = await Passkey.authenticate();
      console.log('[Login] credentialId:', assertion.credentialId);
      console.log('[Login] userIdHex:', assertion.userIdHex ?? 'none');

      // 2. Try local AsyncStorage first
      const localAccounts = await loadAccounts();
      console.log('[Login] Local accounts:', localAccounts.length, localAccounts.map(a => ({ id: a.id.slice(0, 12), name: a.name })));
      const local = localAccounts.find(a => a.id === assertion.credentialId);

      if (local) {
        console.log('[Login] Found locally:', local.name, local.address);
        dispatch({
          type: 'SET_WALLET',
          accounts: localAccounts,
          activeIndex: localAccounts.indexOf(local),
        });
        router.replace('/(tabs)/wallet');
        return;
      }
      console.log('[Login] Not found locally');

      // 3. Try CloudSync (iCloud / Google backup)
      console.log('[Login] Trying CloudSync...');
      const cloudAccount = await tryCloudSync(assertion.credentialId);
      if (cloudAccount) {
        console.log('[Login] Found in CloudSync:', cloudAccount.name, cloudAccount.address);
        await saveAccount(cloudAccount);
        dispatch({ type: 'ADD_ACCOUNT', account: cloudAccount });
        router.replace('/(tabs)/wallet');
        return;
      }
      console.log('[Login] Not found in CloudSync');

      // 4. Try public key index server
      console.log('[Login] Querying server: rpId=', Passkey.RELYING_PARTY, 'credentialId=', assertion.credentialId);
      const record = await PublicKeyIndex.queryRecord(
        Passkey.RELYING_PARTY,
        assertion.credentialId,
      );
      console.log('[Login] Server returned:', record.name, 'publicKey:', record.publicKey.slice(0, 16) + '...');

      const address = computeAddress(record.publicKey);
      const userName = record.name || decodeUserNameFromAssertion(assertion.userIdHex);

      const account: StoredAccount = {
        id: assertion.credentialId,
        name: userName,
        address,
        publicKeyHex: record.publicKey,
        createdAt: new Date().toISOString(),
      };
      await saveAccount(account);
      dispatch({ type: 'ADD_ACCOUNT', account });
      router.replace('/(tabs)/wallet');

    } catch (error) {
      if (error instanceof PasskeyError && error.code === PasskeyErrorCode.CANCELLED) {
        // User cancelled — do nothing
      } else {
        Alert.alert('Login Failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoginLoading(false);
    }
  }

  if (step === 'create') {
    return (
      <CreateWalletScreen
        onBack={() => setStep('welcome')}
        onCreated={() => router.replace('/(tabs)/wallet')}
      />
    );
  }

  return (
    <WelcomeScreen
      onCreateWallet={() => setStep('create')}
      onLogin={handleLogin}
    />
  );
}

/** Try to find the account in cloud-synced storage (iCloud / Google backup). */
async function tryCloudSync(credentialId: string): Promise<StoredAccount | null> {
  try {
    const cloudAccounts = await CloudSync.get<StoredAccount[]>('vela.accounts');
    if (!cloudAccounts || !Array.isArray(cloudAccounts)) return null;
    return cloudAccounts.find(a => a.id === credentialId) ?? null;
  } catch {
    return null;
  }
}

/** Decode username from the assertion's userIdHex field. */
function decodeUserNameFromAssertion(userIdHex?: string): string {
  if (!userIdHex) return 'Wallet';
  try {
    const bytes = fromHex(userIdHex);
    const str = String.fromCharCode(...bytes);
    return Passkey.decodeUserName(str) || 'Wallet';
  } catch {
    return 'Wallet';
  }
}
