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
// Block estimation — uses actual on-chain timestamps, no hardcoded values
// ---------------------------------------------------------------------------

async function getBlockInfo(chainId: number, blockTag: string): Promise<{ number: number; timestamp: number } | null> {
  const res = await rpcCall('eth_getBlockByNumber', [blockTag, false], chainId);
  if (res.error || !res.result) return null;
  const block = res.result as { number?: string; timestamp?: string };
  if (!block.number || !block.timestamp) return null;
  return {
    number: parseInt(block.number, 16),
    timestamp: parseInt(block.timestamp, 16),
  };
}

/**
 * Estimate block number at a target timestamp by calculating actual block time
 * from two recent blocks (latest and ~1000 blocks ago).
 */
async function estimateBlocks(chainId: number): Promise<{
  currentBlock: number;
  currentTimestamp: number;
  avgBlockTime: number;
} | null> {
  const latest = await getBlockInfo(chainId, 'latest');
  if (!latest) return null;

  // Sample a block ~1000 blocks ago to calculate actual block time
  const sampleBlock = Math.max(0, latest.number - 1000);
  const sample = await getBlockInfo(chainId, '0x' + sampleBlock.toString(16));
  if (!sample) return null;

  const blockDiff = latest.number - sample.number;
  const timeDiff = latest.timestamp - sample.timestamp;
  if (blockDiff <= 0 || timeDiff <= 0) return null;

  return {
    currentBlock: latest.number,
    currentTimestamp: latest.timestamp,
    avgBlockTime: timeDiff / blockDiff,
  };
}

function blockAtTime(current: { currentBlock: number; currentTimestamp: number; avgBlockTime: number }, targetTimestamp: number): number {
  const secondsAgo = current.currentTimestamp - targetTimestamp;
  const blocksAgo = Math.floor(secondsAgo / current.avgBlockTime);
  return Math.max(0, current.currentBlock - blocksAgo);
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

  // Calculate actual block time from recent on-chain data
  const chain = await estimateBlocks(chainId);
  if (!chain) return [];

  const now = new Date();

  // Generate midnight timestamps for the past 7 days (local time)
  const midnights: { date: Date; targetTs: number }[] = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    midnights.push({ date: d, targetTs: Math.floor(d.getTime() / 1000) });
  }

  // Estimate block numbers, verify timestamps, query balances — all in parallel
  const queries = midnights.map(async ({ date, targetTs }) => {
    const estimatedBlock = blockAtTime(chain, targetTs);
    const blockHex = '0x' + estimatedBlock.toString(16);

    // Verify: get the actual block timestamp to confirm accuracy
    const blockInfo = await getBlockInfo(chainId, blockHex);
    if (!blockInfo) return null;

    // Check the estimated block is within ±1 hour of target midnight
    const drift = Math.abs(blockInfo.timestamp - targetTs);
    if (drift > 3600) {
      console.warn(`[BalanceHistory] Block ${estimatedBlock} timestamp drift ${drift}s > 1h for ${date.toISOString()}, skipping`);
      return null;
    }

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
