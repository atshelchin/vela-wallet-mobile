/**
 * 7-day historical balance for a token.
 *
 * Estimates block numbers for each day's local midnight,
 * then queries eth_getBalance (native) or balanceOf (ERC-20)
 * at those blocks. Silently skips days where the RPC doesn't
 * support archive queries.
 */

import { rpcCall } from './rpc-adapter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BalancePoint {
  /** Local date string, e.g. "May 14" */
  label: string;
  /** Balance as a float (human-readable units, not wei) */
  balance: number;
}

// ---------------------------------------------------------------------------
// Block estimation
// ---------------------------------------------------------------------------

/** Average block time in seconds per chain. */
const AVG_BLOCK_TIME: Record<number, number> = {
  1: 12,       // Ethereum
  56: 3,       // BSC
  137: 2,      // Polygon
  42161: 0.25, // Arbitrum
  10: 2,       // Optimism
  8453: 2,     // Base
  43114: 2,    // Avalanche
  100: 5,      // Gnosis
};

async function getCurrentBlock(chainId: number): Promise<number> {
  const res = await rpcCall('eth_blockNumber', [], chainId);
  if (res.error || !res.result) return 0;
  return parseInt(res.result as string, 16);
}

function estimateBlockAt(currentBlock: number, currentTime: number, targetTime: number, chainId: number): number {
  const avgTime = AVG_BLOCK_TIME[chainId] ?? 3;
  const secondsAgo = (currentTime - targetTime) / 1000;
  const blocksAgo = Math.floor(secondsAgo / avgTime);
  return Math.max(0, currentBlock - blocksAgo);
}

// ---------------------------------------------------------------------------
// Balance queries
// ---------------------------------------------------------------------------

/** ERC-20 balanceOf(address) selector */
const BALANCE_OF = '0x70a08231';

function encodeBalanceOf(address: string): string {
  return BALANCE_OF + '000000000000000000000000' + address.toLowerCase().slice(2);
}

async function queryBalance(
  address: string,
  chainId: number,
  tokenAddress: string | null,
  decimals: number,
  blockHex: string,
): Promise<number | null> {
  try {
    let result: string | undefined;

    if (!tokenAddress) {
      // Native token
      const res = await rpcCall('eth_getBalance', [address, blockHex], chainId);
      if (res.error || !res.result) return null;
      result = res.result as string;
    } else {
      // ERC-20
      const data = encodeBalanceOf(address);
      const res = await rpcCall('eth_call', [{ to: tokenAddress, data }, blockHex], chainId);
      if (res.error || !res.result || res.result === '0x') return null;
      result = res.result as string;
    }

    // Convert hex wei to float
    const wei = BigInt(result);
    return Number(wei) / Math.pow(10, decimals);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch 7-day balance history for a token.
 * Returns up to 8 data points (7 past midnights + current balance).
 * Points where the RPC doesn't support archive queries are omitted.
 */
export async function fetch7DayHistory(params: {
  address: string;
  chainId: number;
  tokenAddress: string | null;
  decimals: number;
  currentBalance: number;
}): Promise<BalancePoint[]> {
  const { address, chainId, tokenAddress, decimals, currentBalance } = params;

  const now = new Date();
  const currentBlock = await getCurrentBlock(chainId);
  if (currentBlock === 0) return [];

  const nowMs = now.getTime();

  // Generate midnight timestamps for the past 7 days (local time)
  const midnights: { date: Date; ms: number }[] = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    midnights.push({ date: d, ms: d.getTime() });
  }

  // Estimate block numbers and query in parallel
  const queries = midnights.map(async ({ date, ms }) => {
    const block = estimateBlockAt(currentBlock, nowMs, ms, chainId);
    const blockHex = '0x' + block.toString(16);
    const balance = await queryBalance(address, chainId, tokenAddress, decimals, blockHex);

    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return balance !== null ? { label, balance } : null;
  });

  const results = await Promise.allSettled(queries);
  const points: BalancePoint[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      points.push(r.value);
    }
  }

  // Add current balance as today's data point
  const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  points.push({ label: todayLabel, balance: currentBalance });

  return points;
}
