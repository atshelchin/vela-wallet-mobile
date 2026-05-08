/**
 * Network compatibility checker.
 *
 * Validates the admission condition for new EVM networks:
 * SafeSingletonFactory must be deployed and bytecode must match ETH mainnet.
 */

import type { CompatibilityResult } from '@/models/types';
import { fetchChainInfo } from './chain-registry';

/**
 * Safe Singleton Factory — the canonical deterministic deployer used by Safe.
 * See: https://github.com/safe-global/safe-singleton-factory
 *
 * Note: 0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37 (referenced in v1.0.0 doc)
 * is a one-time-use CREATE2 deployer that self-destructs after deployment.
 * The persistent factory is at 0x914d... which remains on-chain after use.
 */
const SAFE_SINGLETON_FACTORY = '0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7';

/**
 * Expected runtime bytecode of the Safe Singleton Factory (69 bytes).
 * Small enough to compare directly — no hashing needed.
 * Source: eth_getCode on ETH mainnet at 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7
 */
const EXPECTED_BYTECODE = '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3';

/**
 * Well-known public RPCs to try when the chain-provided RPC fails.
 */
const FALLBACK_RPCS: Record<number, string[]> = {
  1284: ['https://rpc.api.moonbeam.network', 'https://moonbeam-rpc.publicnode.com', 'https://1rpc.io/glmr'],
  1285: ['https://rpc.api.moonriver.moonbeam.network'],
};

/**
 * Check if a network is compatible with Vela Wallet.
 *
 * Tries the provided rpcURL first, then falls back to alternative RPCs
 * from the chain registry and hardcoded fallbacks.
 */
export async function checkNetworkCompatibility(
  rpcURL: string,
  chainId: number,
): Promise<CompatibilityResult> {
  // Build list of RPCs to try
  const rpcsToTry = [rpcURL];

  // Add fallback RPCs for known chains
  const fallbacks = FALLBACK_RPCS[chainId];
  if (fallbacks) {
    for (const fb of fallbacks) {
      if (!rpcsToTry.includes(fb)) rpcsToTry.push(fb);
    }
  }

  // Try to get more RPCs from chain registry
  try {
    const chainInfo = await fetchChainInfo(chainId);
    if (chainInfo?.rpcUrl && !rpcsToTry.includes(chainInfo.rpcUrl)) {
      rpcsToTry.push(chainInfo.rpcUrl);
    }
  } catch {}

  let lastError = '';

  for (const rpc of rpcsToTry) {
    if (!rpc || !rpc.startsWith('http')) continue;

    console.log(`[NetworkChecker] Trying RPC: ${rpc} for chain ${chainId}`);
    const result = await tryRpc(rpc, chainId);

    if (result.error) {
      console.log(`[NetworkChecker] RPC failed: ${rpc} — ${result.error}`);
      lastError = result.error;
      continue;
    }

    return result;
  }

  return {
    chainId,
    factoryDeployed: false,
    bytecodeMatch: false,
    compatible: false,
    rpcFailed: true,
    error: lastError || 'All RPC endpoints failed',
  };
}

async function tryRpc(rpcURL: string, chainId: number): Promise<CompatibilityResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(rpcURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getCode',
        params: [SAFE_SINGLETON_FACTORY, 'latest'],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        chainId,
        factoryDeployed: false,
        bytecodeMatch: false,
        compatible: false,
        error: `HTTP ${response.status}`,
      };
    }

    const json = await response.json();

    if (json.error) {
      return {
        chainId,
        factoryDeployed: false,
        bytecodeMatch: false,
        compatible: false,
        error: json.error.message ?? 'RPC error',
      };
    }

    const bytecode = json.result as string | undefined;

    if (!bytecode || bytecode === '0x' || bytecode.length <= 2) {
      return {
        chainId,
        factoryDeployed: false,
        bytecodeMatch: false,
        compatible: false,
        error: 'SafeSingletonFactory not deployed on this network',
      };
    }

    const bytecodeMatch = bytecode.toLowerCase() === EXPECTED_BYTECODE.toLowerCase();

    return {
      chainId,
      factoryDeployed: true,
      bytecodeMatch,
      compatible: bytecodeMatch,
      error: bytecodeMatch ? undefined : 'Bytecode does not match ETH mainnet SafeSingletonFactory',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network unreachable';
    return {
      chainId,
      factoryDeployed: false,
      bytecodeMatch: false,
      compatible: false,
      error: msg.includes('abort') ? 'Request timed out (15s)' : msg,
    };
  }
}
