/**
 * Local + cloud persistence layer.
 *
 * Writes to both AsyncStorage (fast, local) and CloudSync (cross-device).
 * Reads prefer CloudSync data when available, falling back to local.
 *
 * This dual-write strategy ensures:
 *   1. Instant local reads (no network latency)
 *   2. Cross-device availability (via iCloud / Google backup)
 *   3. Graceful degradation when cloud is unavailable
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CloudSync from '@/modules/cloud-sync';
import type { StoredAccount, PendingUpload, CustomToken, NetworkConfig } from '@/models/types';

const KEYS = {
  accounts: 'vela.accounts',
  pendingUploads: 'vela.pendingUploads',
  customTokens: 'vela.customTokens',
  networkConfig: 'vela.networkConfig',
} as const;

// ---------------------------------------------------------------------------
// Generic dual-write helpers
// ---------------------------------------------------------------------------

async function loadArray<T>(key: string): Promise<T[]> {
  // Try cloud first, fall back to local
  try {
    const cloudData = await CloudSync.get<T[]>(key);
    if (cloudData != null) {
      // Sync cloud → local to keep local cache fresh
      await AsyncStorage.setItem(key, JSON.stringify(cloudData));
      return cloudData;
    }
  } catch {
    // Cloud unavailable — fall through to local
  }

  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function saveArray<T>(key: string, items: T[]): Promise<void> {
  const json = JSON.stringify(items);
  // Write local first (fast, always available)
  await AsyncStorage.setItem(key, json);
  // Write cloud (best-effort, non-blocking)
  CloudSync.save(key, items).catch(() => {});
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function saveAccount(account: StoredAccount): Promise<void> {
  const accounts = await loadAccounts();
  const filtered = accounts.filter(a => a.id !== account.id);
  filtered.push(account);
  await saveArray(KEYS.accounts, filtered);
}

export async function loadAccounts(): Promise<StoredAccount[]> {
  return loadArray<StoredAccount>(KEYS.accounts);
}

export async function findAccountByCredentialId(id: string): Promise<StoredAccount | undefined> {
  const accounts = await loadAccounts();
  return accounts.find(a => a.id === id);
}

// ---------------------------------------------------------------------------
// Pending Uploads
// ---------------------------------------------------------------------------

export async function savePendingUpload(upload: PendingUpload): Promise<void> {
  const uploads = await loadPendingUploads();
  const filtered = uploads.filter(u => u.id !== upload.id);
  filtered.push(upload);
  await saveArray(KEYS.pendingUploads, filtered);
}

export async function loadPendingUploads(): Promise<PendingUpload[]> {
  return loadArray<PendingUpload>(KEYS.pendingUploads);
}

export async function removePendingUpload(credentialId: string): Promise<void> {
  const uploads = await loadPendingUploads();
  await saveArray(KEYS.pendingUploads, uploads.filter(u => u.id !== credentialId));
}

export async function hasPendingUploads(): Promise<boolean> {
  const uploads = await loadPendingUploads();
  return uploads.length > 0;
}

// ---------------------------------------------------------------------------
// Custom Tokens
// ---------------------------------------------------------------------------

export async function saveCustomToken(token: CustomToken): Promise<void> {
  const tokens = await loadCustomTokens();
  const filtered = tokens.filter(t => t.id !== token.id);
  filtered.push(token);
  await saveArray(KEYS.customTokens, filtered);
}

export async function loadCustomTokens(): Promise<CustomToken[]> {
  return loadArray<CustomToken>(KEYS.customTokens);
}

export async function removeCustomToken(id: string): Promise<void> {
  const tokens = await loadCustomTokens();
  await saveArray(KEYS.customTokens, tokens.filter(t => t.id !== id));
}

// ---------------------------------------------------------------------------
// Network Config
// ---------------------------------------------------------------------------

export async function saveNetworkConfig(config: NetworkConfig): Promise<void> {
  const configs = await loadNetworkConfigs();
  const filtered = configs.filter(c => c.chainId !== config.chainId);
  filtered.push(config);
  await saveArray(KEYS.networkConfig, filtered);
}

export async function loadNetworkConfigs(): Promise<NetworkConfig[]> {
  return loadArray<NetworkConfig>(KEYS.networkConfig);
}

export async function getNetworkConfig(chainId: number): Promise<NetworkConfig | undefined> {
  const configs = await loadNetworkConfigs();
  return configs.find(c => c.chainId === chainId);
}

// ---------------------------------------------------------------------------
// Clear All (for logout)
// ---------------------------------------------------------------------------

export async function clearAll(): Promise<void> {
  // Clear local
  for (const key of Object.values(KEYS)) {
    await AsyncStorage.removeItem(key);
  }
  // Clear cloud (best-effort)
  for (const key of Object.values(KEYS)) {
    CloudSync.remove(key).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Sync utilities
// ---------------------------------------------------------------------------

/** Force a full sync cycle: push all local data to cloud. */
export async function pushAllToCloud(): Promise<void> {
  for (const key of Object.values(KEYS)) {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      try {
        await CloudSync.save(key, JSON.parse(raw));
      } catch {
        // Skip keys that fail
      }
    }
  }
  await CloudSync.syncNow().catch(() => {});
}

/** Pull all cloud data to local storage. */
export async function pullAllFromCloud(): Promise<void> {
  for (const key of Object.values(KEYS)) {
    try {
      const data = await CloudSync.get(key);
      if (data != null) {
        await AsyncStorage.setItem(key, JSON.stringify(data));
      }
    } catch {
      // Skip keys that fail
    }
  }
}
