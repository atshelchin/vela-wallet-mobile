/**
 * Bundler / Deployer address management.
 *
 * In production, addresses are derived server-side from:
 *   passkeys publicKey + tag("bundler"|"deployer") + server secret → EOA
 *
 * Currently mocked — address derivation uses a placeholder algorithm.
 * Balance queries are REAL (on-chain eth_getBalance via rpcCall).
 */

import type { BundlerDeployerInfo, NetworkFundingStatus, FundingStatus } from '@/models/types';
import { rpcCall } from './rpc-adapter';
import { keccak256 } from './eth-crypto';

// ---------------------------------------------------------------------------
// Address derivation (mock)
// ---------------------------------------------------------------------------

/**
 * Get Bundler and Deployer EOA addresses for a wallet.
 * TODO: Replace with real API call to deployer service.
 */
export async function getAddresses(publicKeyHex: string): Promise<BundlerDeployerInfo> {
  // Mock: derive deterministic addresses from public key + tag
  const encoder = new TextEncoder();
  const bundlerHash = keccak256(
    new Uint8Array([...fromHexLight(publicKeyHex), ...encoder.encode('bundler')]),
  );
  const deployerHash = keccak256(
    new Uint8Array([...fromHexLight(publicKeyHex), ...encoder.encode('deployer')]),
  );

  const bundlerAddress = '0x' + toHexLight(bundlerHash).slice(0, 40);
  const deployerAddress = '0x' + toHexLight(deployerHash).slice(0, 40);

  return {
    walletAddress: '', // filled by caller
    bundlerAddress,
    deployerAddress,
  };
}

// ---------------------------------------------------------------------------
// Balance queries (real on-chain)
// ---------------------------------------------------------------------------

/** Balance thresholds in wei */
const LOW_THRESHOLD = BigInt('1000000000000000');    // 0.001 ETH
const ZERO_THRESHOLD = BigInt('100000000000000');     // 0.0001 ETH

function balanceToStatus(balanceWei: bigint): FundingStatus {
  if (balanceWei < ZERO_THRESHOLD) return 'not_funded';
  if (balanceWei < LOW_THRESHOLD) return 'low_balance';
  return 'funded';
}

function formatWei(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  if (eth === 0) return '0';
  if (eth < 0.000001) return '< 0.000001';
  if (eth < 0.001) return eth.toFixed(6);
  return eth.toFixed(4);
}

async function getBalance(address: string, chainId: number): Promise<bigint> {
  try {
    const res = await rpcCall('eth_getBalance', [address, 'latest'], chainId);
    const hex = res.result as string | undefined;
    if (!hex) return 0n;
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

/** Get funding status for a specific network. */
export async function getNetworkFunding(
  bundlerAddress: string,
  deployerAddress: string,
  chainId: number,
): Promise<NetworkFundingStatus> {
  const [bundlerWei, deployerWei] = await Promise.all([
    getBalance(bundlerAddress, chainId),
    getBalance(deployerAddress, chainId),
  ]);

  return {
    chainId,
    bundlerBalance: formatWei(bundlerWei),
    deployerBalance: formatWei(deployerWei),
    bundlerStatus: balanceToStatus(bundlerWei),
    deployerStatus: balanceToStatus(deployerWei),
  };
}

/** Get funding status for all networks in parallel. */
export async function getAllNetworkFunding(
  bundlerAddress: string,
  deployerAddress: string,
  chainIds: number[],
): Promise<NetworkFundingStatus[]> {
  const results = await Promise.allSettled(
    chainIds.map(chainId => getNetworkFunding(bundlerAddress, deployerAddress, chainId)),
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      chainId: chainIds[i],
      bundlerBalance: '0',
      deployerBalance: '0',
      bundlerStatus: 'not_funded' as FundingStatus,
      deployerStatus: 'not_funded' as FundingStatus,
    };
  });
}

// ---------------------------------------------------------------------------
// Hex helpers (lightweight, no import cycle)
// ---------------------------------------------------------------------------

function fromHexLight(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function toHexLight(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
