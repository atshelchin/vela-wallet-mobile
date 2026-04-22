import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { VelaBLE } = NativeModules;
const bleEmitter = VelaBLE ? new NativeEventEmitter(VelaBLE) : null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BLE_SERVICE_UUID = '0000BE1A-0000-1000-8000-00805F9B34FB';
export const BLE_REQUEST_CHAR_UUID = '0001BE1A-0000-1000-8000-00805F9B34FB';
export const BLE_RESPONSE_CHAR_UUID = '0002BE1A-0000-1000-8000-00805F9B34FB';
export const BLE_WALLET_INFO_CHAR_UUID = '0003BE1A-0000-1000-8000-00805F9B34FB';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BLEAdvertisingConfig {
  walletAddress: string;
  accountName: string;
  chainId: number;
  accounts?: Array<{ name: string; address: string }>;
}

export interface BLEServiceDefinition {
  uuid: string;
  characteristics: BLECharacteristicDefinition[];
}

export interface BLECharacteristicDefinition {
  uuid: string;
  properties: ('read' | 'write' | 'writeWithoutResponse' | 'notify')[];
  permissions: ('readable' | 'writeable')[];
  value?: string; // base64 encoded initial value
}

export type BLEState =
  | 'unknown'
  | 'resetting'
  | 'unsupported'
  | 'unauthorized'
  | 'poweredOff'
  | 'poweredOn';

export type BLEEvent =
  | 'stateChange'
  | 'advertisingStarted'
  | 'advertisingStopped'
  | 'centralConnected'
  | 'centralDisconnected'
  | 'requestReceived'
  | 'error';

export interface BLEEventData {
  stateChange: { state: BLEState };
  advertisingStarted: {};
  advertisingStopped: {};
  centralConnected: { centralId: string };
  centralDisconnected: { centralId: string };
  requestReceived: {
    id: string;
    method: string;
    params: any[];
    origin: string;
    favicon?: string;
  };
  error: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Map friendly event names to the prefixed names emitted by the native module. */
const NATIVE_EVENT_PREFIX = 'VelaBLE_';

function nativeEventName(event: BLEEvent): string {
  return `${NATIVE_EVENT_PREFIX}${event}`;
}

function assertNativeModule(): void {
  if (!VelaBLE) {
    throw new Error(
      'VelaBLE native module is not available. ' +
        'Make sure the native BLE peripheral module is linked and the app has been rebuilt.',
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check if BLE peripheral mode is supported on this device. */
export async function isSupported(): Promise<boolean> {
  if (!VelaBLE) {
    return false;
  }
  return VelaBLE.isSupported();
}

/** Get current Bluetooth state. */
export async function getState(): Promise<BLEState> {
  assertNativeModule();
  return VelaBLE.getState();
}

/** Request Bluetooth permissions (location on Android, Bluetooth on iOS 13+). */
export async function requestPermissions(): Promise<boolean> {
  assertNativeModule();
  return VelaBLE.requestPermissions();
}

/**
 * Map the JS-friendly config into the wire format the Chrome extension expects.
 *
 * Chrome reads: { address, name, chainId, accounts: [{name, address}] }
 * JS passes:    { walletAddress, accountName, chainId, accounts }
 */
function toWireFormat(config: BLEAdvertisingConfig): Record<string, unknown> {
  return {
    address: config.walletAddress,
    name: config.accountName,
    chainId: config.chainId,
    accounts: config.accounts ?? [],
  };
}

/** Start advertising as a Vela Wallet peripheral. */
export async function startAdvertising(config: BLEAdvertisingConfig): Promise<void> {
  assertNativeModule();
  return VelaBLE.startAdvertising(toWireFormat(config));
}

/** Stop advertising. */
export async function stopAdvertising(): Promise<void> {
  assertNativeModule();
  return VelaBLE.stopAdvertising();
}

/** Update wallet info (when account/chain changes while already advertising). */
export async function updateWalletInfo(config: BLEAdvertisingConfig): Promise<void> {
  assertNativeModule();
  return VelaBLE.updateWalletInfo(toWireFormat(config));
}

/** Send a response back to the connected central. */
export async function sendResponse(
  id: string,
  result?: any,
  error?: { code: number; message: string },
): Promise<void> {
  assertNativeModule();
  return VelaBLE.sendResponse(id, result ?? null, error ?? null);
}

/**
 * Add an event listener for BLE peripheral events.
 * Returns an unsubscribe function that removes the listener when called.
 */
export function addListener<E extends BLEEvent>(
  event: E,
  handler: (data: BLEEventData[E]) => void,
): () => void {
  if (!bleEmitter) {
    throw new Error(
      'VelaBLE native module is not available. Cannot subscribe to events.',
    );
  }

  const subscription = bleEmitter.addListener(nativeEventName(event), handler);

  return () => {
    subscription.remove();
  };
}

/** Remove all listeners for a given event. */
export function removeAllListeners(event: BLEEvent): void {
  if (!bleEmitter) {
    return;
  }
  bleEmitter.removeAllListeners(nativeEventName(event));
}
