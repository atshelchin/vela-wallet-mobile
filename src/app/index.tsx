import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useWallet } from '@/models/wallet-state';
import { color, createStyles } from '@/constants/theme';

export default function Index() {
  const { state } = useWallet();

  if (state.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={color.accent.base} />
      </View>
    );
  }

  if (state.hasWallet) {
    return <Redirect href="/(tabs)/wallet" />;
  }
  return <Redirect href="/onboarding" />;
}

const styles = createStyles(() => ({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.bg.base,
  },
}));
