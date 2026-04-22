import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { WelcomeScreen } from './WelcomeScreen';
import { CreateWalletScreen } from './CreateWalletScreen';
import { useWallet } from '@/models/wallet-state';
import { loadAccounts, saveAccount } from '@/services/storage';
import { fromHex, toHex } from '@/services/hex';
import { computeAddress } from '@/services/safe-address';
import * as Passkey from '@/modules/passkey';
import { PasskeyError, PasskeyErrorCode } from '@/modules/passkey';
import * as PublicKeyIndex from '@/services/public-key-index';

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

      // 2. Try to find account locally first
      const localAccounts = await loadAccounts();
      const local = localAccounts.find(a => a.id === assertion.credentialId);

      if (local) {
        // Found locally — restore wallet
        dispatch({
          type: 'SET_WALLET',
          accounts: localAccounts,
          activeIndex: localAccounts.indexOf(local),
        });
        router.replace('/(tabs)/wallet');
        return;
      }

      // 3. Not found locally — query public key index server
      const record = await PublicKeyIndex.queryRecord(
        Passkey.RELYING_PARTY,
        assertion.credentialId,
      );

      // 4. Compute address from recovered public key
      const address = computeAddress(record.publicKey);
      const userName = record.name || Passkey.decodeUserName(
        assertion.userIdHex
          ? String.fromCharCode(...fromHex(assertion.userIdHex))
          : '',
      );

      // 5. Save and restore
      const account = {
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
