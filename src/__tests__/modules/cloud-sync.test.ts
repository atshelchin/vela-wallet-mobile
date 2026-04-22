/**
 * Tests for CloudSync JS bridge.
 *
 * Covers: API surface, type contracts, error model, encoding,
 *         native-absent and native-present modes.
 *
 * Native-side cloud operations require a real device + signed-in
 * iCloud / Google account, so we only test the JS layer here.
 */

// Default mock — native module absent
jest.mock('react-native', () => ({
  NativeModules: { VelaCloudSync: null },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    removeAllListeners: jest.fn(),
  })),
  Platform: { OS: 'ios' },
}));

import {
  isSupported,
  getAvailability,
  save,
  get,
  remove,
  listKeys,
  syncNow,
  addListener,
  CloudSyncErrorCode,
  CloudSyncError,
  CloudSyncAvailability,
  type CloudSyncEvent,
} from '@/modules/cloud-sync';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

describe('CloudSyncErrorCode', () => {
  test('defines all required codes', () => {
    expect(CloudSyncErrorCode.NOT_AVAILABLE).toBe('CLOUD_NOT_AVAILABLE');
    expect(CloudSyncErrorCode.NOT_SIGNED_IN).toBe('CLOUD_NOT_SIGNED_IN');
    expect(CloudSyncErrorCode.QUOTA_EXCEEDED).toBe('CLOUD_QUOTA_EXCEEDED');
    expect(CloudSyncErrorCode.NETWORK_ERROR).toBe('CLOUD_NETWORK_ERROR');
    expect(CloudSyncErrorCode.FAILED).toBe('CLOUD_FAILED');
  });
});

describe('CloudSyncAvailability', () => {
  test('defines all states', () => {
    expect(CloudSyncAvailability.AVAILABLE).toBe('available');
    expect(CloudSyncAvailability.NOT_SIGNED_IN).toBe('notSignedIn');
    expect(CloudSyncAvailability.RESTRICTED).toBe('restricted');
    expect(CloudSyncAvailability.NOT_SUPPORTED).toBe('notSupported');
  });
});

// ---------------------------------------------------------------------------
// CloudSyncError
// ---------------------------------------------------------------------------

describe('CloudSyncError', () => {
  test('carries code and message', () => {
    const err = new CloudSyncError(CloudSyncErrorCode.QUOTA_EXCEEDED, 'too big');
    expect(err.code).toBe('CLOUD_QUOTA_EXCEEDED');
    expect(err.message).toBe('too big');
    expect(err.name).toBe('CloudSyncError');
    expect(err instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// API — native module absent
// ---------------------------------------------------------------------------

describe('CloudSync (native absent)', () => {
  test('isSupported returns false', async () => {
    expect(await isSupported()).toBe(false);
  });

  test('getAvailability returns notSupported', async () => {
    expect(await getAvailability()).toBe(CloudSyncAvailability.NOT_SUPPORTED);
  });

  test('save rejects with NOT_AVAILABLE', async () => {
    await expect(save('key', 'value')).rejects.toMatchObject({
      code: CloudSyncErrorCode.NOT_AVAILABLE,
    });
  });

  test('get rejects with NOT_AVAILABLE', async () => {
    await expect(get('key')).rejects.toMatchObject({
      code: CloudSyncErrorCode.NOT_AVAILABLE,
    });
  });

  test('remove rejects with NOT_AVAILABLE', async () => {
    await expect(remove('key')).rejects.toMatchObject({
      code: CloudSyncErrorCode.NOT_AVAILABLE,
    });
  });

  test('listKeys rejects with NOT_AVAILABLE', async () => {
    await expect(listKeys()).rejects.toMatchObject({
      code: CloudSyncErrorCode.NOT_AVAILABLE,
    });
  });

  test('syncNow rejects with NOT_AVAILABLE', async () => {
    await expect(syncNow()).rejects.toMatchObject({
      code: CloudSyncErrorCode.NOT_AVAILABLE,
    });
  });

  test('addListener returns unsubscribe function without throwing', () => {
    const unsub = addListener('syncCompleted', () => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// API — native module present (mocked)
// ---------------------------------------------------------------------------

describe('CloudSync (native present)', () => {
  let CS: typeof import('@/modules/cloud-sync');

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      NativeModules: {
        VelaCloudSync: {
          isSupported: jest.fn().mockResolvedValue(true),
          getAvailability: jest.fn().mockResolvedValue('available'),
          save: jest.fn().mockResolvedValue(null),
          get: jest.fn().mockResolvedValue('{"foo":1}'),
          remove: jest.fn().mockResolvedValue(null),
          listKeys: jest.fn().mockResolvedValue(['key1', 'key2']),
          syncNow: jest.fn().mockResolvedValue(null),
        },
      },
      NativeEventEmitter: jest.fn().mockImplementation(() => ({
        addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
        removeAllListeners: jest.fn(),
      })),
      Platform: { OS: 'ios' },
    }));
    CS = require('@/modules/cloud-sync');
  });

  test('isSupported returns true', async () => {
    expect(await CS.isSupported()).toBe(true);
  });

  test('getAvailability returns native value', async () => {
    expect(await CS.getAvailability()).toBe('available');
  });

  test('save passes key and JSON string', async () => {
    await CS.save('myKey', { foo: 1 });

    const { NativeModules } = require('react-native');
    expect(NativeModules.VelaCloudSync.save).toHaveBeenCalledWith(
      'myKey',
      '{"foo":1}',
    );
  });

  test('save accepts string value', async () => {
    await CS.save('myKey', 'hello');

    const { NativeModules } = require('react-native');
    expect(NativeModules.VelaCloudSync.save).toHaveBeenCalledWith(
      'myKey',
      '"hello"',
    );
  });

  test('get returns parsed value', async () => {
    const result = await CS.get('myKey');
    expect(result).toEqual({ foo: 1 });
  });

  test('get returns null for missing key', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      NativeModules: {
        VelaCloudSync: {
          get: jest.fn().mockResolvedValue(null),
        },
      },
      NativeEventEmitter: jest.fn().mockImplementation(() => ({
        addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
        removeAllListeners: jest.fn(),
      })),
      Platform: { OS: 'ios' },
    }));
    const CS2 = require('@/modules/cloud-sync');
    expect(await CS2.get('noSuchKey')).toBeNull();
  });

  test('remove passes key', async () => {
    await CS.remove('myKey');

    const { NativeModules } = require('react-native');
    expect(NativeModules.VelaCloudSync.remove).toHaveBeenCalledWith('myKey');
  });

  test('listKeys returns array', async () => {
    const keys = await CS.listKeys();
    expect(keys).toEqual(['key1', 'key2']);
  });

  test('syncNow calls native', async () => {
    await CS.syncNow();

    const { NativeModules } = require('react-native');
    expect(NativeModules.VelaCloudSync.syncNow).toHaveBeenCalled();
  });

  test('save rejects on native error with typed code', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => {
      const nativeErr: any = new Error('Storage full');
      nativeErr.code = 'CLOUD_QUOTA_EXCEEDED';
      return {
        NativeModules: {
          VelaCloudSync: {
            save: jest.fn().mockRejectedValue(nativeErr),
          },
        },
        NativeEventEmitter: jest.fn().mockImplementation(() => ({
          addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
          removeAllListeners: jest.fn(),
        })),
        Platform: { OS: 'ios' },
      };
    });
    const CS3 = require('@/modules/cloud-sync');
    await expect(CS3.save('k', 'v')).rejects.toMatchObject({
      code: 'CLOUD_QUOTA_EXCEEDED',
    });
  });
});

// ---------------------------------------------------------------------------
// Event listener type validation
// ---------------------------------------------------------------------------

describe('addListener event types', () => {
  test('syncCompleted is a valid event', () => {
    const unsub = addListener('syncCompleted', () => {});
    expect(typeof unsub).toBe('function');
  });

  test('syncFailed is a valid event', () => {
    const unsub = addListener('syncFailed', () => {});
    expect(typeof unsub).toBe('function');
  });

  test('dataChanged is a valid event', () => {
    const unsub = addListener('dataChanged', (data) => {
      // type-check: data should have changedKeys
    });
    expect(typeof unsub).toBe('function');
  });
});
