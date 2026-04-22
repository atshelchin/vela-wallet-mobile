import { Redirect } from 'expo-router';
import { useWallet } from '@/models/wallet-state';

export default function Index() {
  const { state } = useWallet();
  if (state.hasWallet) {
    return <Redirect href="/(tabs)/wallet" />;
  }
  return <Redirect href="/onboarding" />;
}
