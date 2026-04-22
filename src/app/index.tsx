import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useWallet } from '@/models/wallet-state';
import { VelaColor } from '@/constants/theme';

export default function Index() {
  const { state } = useWallet();

  // Wait for storage to load before routing
  if (state.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={VelaColor.accent} />
      </View>
    );
  }

  if (state.hasWallet) {
    return <Redirect href="/(tabs)/wallet" />;
  }
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: VelaColor.bg,
  },
});
