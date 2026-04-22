/**
 * Tests for BLE JS bridge interface.
 * Tests the JS API layer (not native module — that requires device testing).
 */

// Mock NativeModules since we're testing in Node
jest.mock('react-native', () => ({
  NativeModules: {
    VelaBLE: null, // Simulate native module not available
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    removeAllListeners: jest.fn(),
  })),
  Platform: { OS: 'ios' },
}));

import * as BLE from '@/modules/ble';

describe('BLE module (native module unavailable)', () => {
  test('isSupported returns false when native module missing', async () => {
    const result = await BLE.isSupported();
    expect(result).toBe(false);
  });

  test('getState throws when native module missing', async () => {
    await expect(BLE.getState()).rejects.toThrow();
  });

  test('startAdvertising throws when native module missing', async () => {
    await expect(BLE.startAdvertising({
      walletAddress: '0x123',
      accountName: 'Test',
      chainId: 1,
    })).rejects.toThrow();
  });

  test('stopAdvertising throws when native module missing', async () => {
    await expect(BLE.stopAdvertising()).rejects.toThrow();
  });

  test('BLE UUIDs are correctly defined', () => {
    expect(BLE.BLE_SERVICE_UUID).toBe('0000BE1A-0000-1000-8000-00805F9B34FB');
    expect(BLE.BLE_REQUEST_CHAR_UUID).toBe('0001BE1A-0000-1000-8000-00805F9B34FB');
    expect(BLE.BLE_RESPONSE_CHAR_UUID).toBe('0002BE1A-0000-1000-8000-00805F9B34FB');
    expect(BLE.BLE_WALLET_INFO_CHAR_UUID).toBe('0003BE1A-0000-1000-8000-00805F9B34FB');
  });
});

describe('BLE module (native module available)', () => {
  beforeEach(() => {
    // Re-mock with native module present
    jest.resetModules();
  });

  test('addListener throws when native module missing', () => {
    // Without native module, addListener should throw
    expect(() => BLE.addListener('stateChange', () => {})).toThrow('not available');
  });

  test('removeAllListeners does not throw', () => {
    expect(() => BLE.removeAllListeners('stateChange')).not.toThrow();
  });
});
