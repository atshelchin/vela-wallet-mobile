/**
 * Per-account total USD balance cache.
 *
 * - In-memory map with 30-minute TTL
 * - Persisted to AsyncStorage so it survives app restart
 * - Updated whenever HomeScreen finishes loading tokens for an account
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'vela.balanceCache';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  usd: number;
  at: number; // Date.now() when written
}

const mem = new Map<string, CacheEntry>();
let loaded = false;

/** Hydrate in-memory cache from AsyncStorage (once). */
async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: Record<string, CacheEntry> = JSON.parse(raw);
      for (const [addr, entry] of Object.entries(parsed)) {
        mem.set(addr.toLowerCase(), entry);
      }
    }
  } catch { /* ignore corrupt data */ }
}

/** Persist current in-memory cache to AsyncStorage. */
async function persist() {
  try {
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of mem) obj[k] = v;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* best-effort */ }
}

/** Store total USD balance for an account address. */
export async function setAccountBalance(address: string, usd: number) {
  await ensureLoaded();
  mem.set(address.toLowerCase(), { usd, at: Date.now() });
  persist(); // fire-and-forget
}

/** Get cached balance for an address. Returns null if missing or expired. */
export async function getAccountBalance(address: string): Promise<number | null> {
  await ensureLoaded();
  const entry = mem.get(address.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.usd;
}

/** Get cached balances for multiple addresses. Skips expired entries. */
export async function getAccountBalances(addresses: string[]): Promise<Map<string, number>> {
  await ensureLoaded();
  const now = Date.now();
  const result = new Map<string, number>();
  for (const addr of addresses) {
    const entry = mem.get(addr.toLowerCase());
    if (entry && now - entry.at <= TTL_MS) {
      result.set(addr, entry.usd);
    }
  }
  return result;
}
