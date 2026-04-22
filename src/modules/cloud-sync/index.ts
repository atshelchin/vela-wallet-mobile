/**
 * Cloud Sync native module — JS bridge.
 *
 * Provides cross-device cloud synchronisation for small key-value data
 * (passkey metadata, account info, custom tokens, network configs).
 *
 * Platform backends:
 *   - iOS:     NSUbiquitousKeyValueStore  (iCloud Key-Value Store)
 *   - Android: BlockStore API  (Google Play Services backup)
 *
 * Design principles:
 *   - Values cross the bridge as JSON strings — native stores opaque strings
 *   - JS layer handles serialisation/deserialisation
 *   - Native layer is a thin bridge; no business logic
 *   - Errors carry a typed code for deterministic branching
 *   - Events are emitted for external sync changes (iCloud push, etc.)
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

const { VelaCloudSync } = NativeModules;
const emitter = VelaCloudSync ? new NativeEventEmitter(VelaCloudSync) : null;

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export const CloudSyncErrorCode = {
  /** Native module is not linked or the app has not been rebuilt. */
  NOT_AVAILABLE: 'CLOUD_NOT_AVAILABLE',
  /** User is not signed into iCloud / Google account. */
  NOT_SIGNED_IN: 'CLOUD_NOT_SIGNED_IN',
  /** iCloud KV store 1 MB limit exceeded, or BlockStore quota reached. */
  QUOTA_EXCEEDED: 'CLOUD_QUOTA_EXCEEDED',
  /** Network unavailable during sync attempt. */
  NETWORK_ERROR: 'CLOUD_NETWORK_ERROR',
  /** Generic failure. */
  FAILED: 'CLOUD_FAILED',
} as const;

export type CloudSyncErrorCode =
  (typeof CloudSyncErrorCode)[keyof typeof CloudSyncErrorCode];

export class CloudSyncError extends Error {
  readonly code: CloudSyncErrorCode;

  constructor(code: CloudSyncErrorCode, message: string) {
    super(message);
    this.name = 'CloudSyncError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const CloudSyncAvailability = {
  /** Cloud sync is available and ready. */
  AVAILABLE: 'available',
  /** User is not signed into a cloud account. */
  NOT_SIGNED_IN: 'notSignedIn',
  /** Cloud access is restricted (e.g. MDM, parental controls). */
  RESTRICTED: 'restricted',
  /** Not supported on this device / OS. */
  NOT_SUPPORTED: 'notSupported',
} as const;

export type CloudSyncAvailability =
  (typeof CloudSyncAvailability)[keyof typeof CloudSyncAvailability];

// ---------------------------------------------------------------------------
// Event model
// ---------------------------------------------------------------------------

export type CloudSyncEvent = 'syncCompleted' | 'syncFailed' | 'dataChanged';

export interface CloudSyncEventData {
  syncCompleted: {};
  syncFailed: { error: string };
  dataChanged: { changedKeys: string[] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether cloud sync is supported on this device.
 *
 * Returns `false` when the native module is missing or the OS lacks support.
 */
export async function isSupported(): Promise<boolean> {
  if (!VelaCloudSync) return false;
  try {
    return await VelaCloudSync.isSupported();
  } catch {
    return false;
  }
}

/**
 * Detailed availability check.
 *
 * Distinguishes between "not signed in", "restricted", and "not supported"
 * so the UI can show an appropriate message.
 */
export async function getAvailability(): Promise<CloudSyncAvailability> {
  if (!VelaCloudSync) return CloudSyncAvailability.NOT_SUPPORTED;
  try {
    return await VelaCloudSync.getAvailability();
  } catch {
    return CloudSyncAvailability.NOT_SUPPORTED;
  }
}

/**
 * Save a value to cloud-synced storage.
 *
 * The value is JSON-serialised before crossing the bridge. The native side
 * stores it as an opaque string keyed by `key`.
 *
 * @param key   Storage key (should be namespaced, e.g. `"vela.accounts"`).
 * @param value Any JSON-serialisable value.
 * @throws {CloudSyncError}
 */
export async function save(key: string, value: unknown): Promise<void> {
  assertAvailable();
  const json = JSON.stringify(value);
  try {
    await VelaCloudSync.save(key, json);
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Retrieve a value from cloud-synced storage.
 *
 * Returns `null` if the key does not exist.
 *
 * @param key Storage key.
 * @returns   The deserialised value, or `null`.
 * @throws {CloudSyncError}
 */
export async function get<T = unknown>(key: string): Promise<T | null> {
  assertAvailable();
  try {
    const json: string | null = await VelaCloudSync.get(key);
    if (json == null) return null;
    return JSON.parse(json) as T;
  } catch (err) {
    // If the error came from JSON.parse, wrap it
    if (err instanceof SyntaxError) {
      throw new CloudSyncError(CloudSyncErrorCode.FAILED, `Corrupt data for key "${key}"`);
    }
    throw normalizeError(err);
  }
}

/**
 * Remove a key from cloud-synced storage.
 *
 * @param key Storage key.
 * @throws {CloudSyncError}
 */
export async function remove(key: string): Promise<void> {
  assertAvailable();
  try {
    await VelaCloudSync.remove(key);
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * List all keys currently stored in cloud-synced storage.
 *
 * @returns Array of key strings.
 * @throws {CloudSyncError}
 */
export async function listKeys(): Promise<string[]> {
  assertAvailable();
  try {
    return await VelaCloudSync.listKeys();
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Request an immediate synchronisation with the cloud backend.
 *
 * On iOS this calls `NSUbiquitousKeyValueStore.synchronize()`.
 * On Android this triggers a BlockStore sync.
 *
 * Note: the system may coalesce or delay the actual sync. This method
 * returns once the request has been submitted, not when sync completes.
 *
 * @throws {CloudSyncError}
 */
export async function syncNow(): Promise<void> {
  assertAvailable();
  try {
    await VelaCloudSync.syncNow();
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Subscribe to cloud sync events.
 *
 * Events:
 *   - `syncCompleted`  — A sync cycle finished successfully.
 *   - `syncFailed`     — A sync cycle failed. Payload includes error string.
 *   - `dataChanged`    — Data was changed externally (another device pushed).
 *                        Payload includes `changedKeys` array.
 *
 * @returns Unsubscribe function.
 */
export function addListener<E extends CloudSyncEvent>(
  event: E,
  handler: (data: CloudSyncEventData[E]) => void,
): () => void {
  if (!emitter) {
    // Return a no-op unsubscribe so callers don't need to guard
    return () => {};
  }
  const sub = emitter.addListener(`VelaCloudSync_${event}`, handler);
  return () => sub.remove();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertAvailable(): void {
  if (!VelaCloudSync) {
    throw new CloudSyncError(
      CloudSyncErrorCode.NOT_AVAILABLE,
      'VelaCloudSync native module is not available. Ensure the module is linked and the app has been rebuilt.',
    );
  }
}

function normalizeError(err: unknown): CloudSyncError {
  if (err instanceof CloudSyncError) return err;

  const raw = err as { code?: string; message?: string };
  const code = mapNativeCode(raw.code);
  const message = raw.message ?? 'Unknown cloud sync error';
  return new CloudSyncError(code, message);
}

function mapNativeCode(code?: string): CloudSyncErrorCode {
  switch (code) {
    case 'CLOUD_NOT_SIGNED_IN':
      return CloudSyncErrorCode.NOT_SIGNED_IN;
    case 'CLOUD_QUOTA_EXCEEDED':
      return CloudSyncErrorCode.QUOTA_EXCEEDED;
    case 'CLOUD_NETWORK_ERROR':
      return CloudSyncErrorCode.NETWORK_ERROR;
    default:
      return CloudSyncErrorCode.FAILED;
  }
}
