import { Platform } from 'react-native';

// Web: WalletConnect (no BLE available)
// iOS/Android: BLE (native Bluetooth peripheral)
const Screen = Platform.OS === 'web'
  ? require('@/screens/connect/WalletConnectScreen').default
  : require('@/screens/connect/VelaConnectScreen').default;

export default Screen;
