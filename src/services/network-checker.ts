/**
 * Network compatibility checker.
 *
 * Validates the admission condition for new EVM networks:
 * SafeSingletonFactory (0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37)
 * must be deployed and bytecode must match ETH mainnet.
 */

import type { CompatibilityResult } from '@/models/types';
import { keccak256 } from './eth-crypto';

const SAFE_SINGLETON_FACTORY = '0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37';

/**
 * Keccak256 hash of the SafeSingletonFactory runtime bytecode.
 *
 * TODO: Verify this hash against the canonical deployment.
 * The SafeSingletonFactory may use CREATE2 deployer patterns where
 * the factory address holds code only on chains where it's deployed.
 * Run: keccak256(eth_getCode("0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37"))
 * on a chain where it's known to be deployed (e.g. Gnosis, Polygon).
 *
 * Set to empty string to skip bytecode matching (only check deployment).
 */
const EXPECTED_BYTECODE_HASH = '';

/**
 * Check if a network is compatible with Vela Wallet.
 *
 * Uses direct fetch (not rpcAdapter) because the target chain
 * may not yet be configured in the app.
 */
export async function checkNetworkCompatibility(
  rpcURL: string,
  chainId: number,
): Promise<CompatibilityResult> {
  try {
    const response = await fetch(rpcURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getCode',
        params: [SAFE_SINGLETON_FACTORY, 'latest'],
      }),
    });

    if (!response.ok) {
      return {
        chainId,
        factoryDeployed: false,
        bytecodeMatch: false,
        compatible: false,
        error: `RPC request failed: HTTP ${response.status}`,
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

    // Compare bytecode hash (skip if EXPECTED_BYTECODE_HASH is empty)
    let bytecodeMatch = true;
    if (EXPECTED_BYTECODE_HASH) {
      const clean = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
      }
      const hash = '0x' + Array.from(keccak256(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
      bytecodeMatch = hash === EXPECTED_BYTECODE_HASH;
    }

    return {
      chainId,
      factoryDeployed: true,
      bytecodeMatch,
      compatible: bytecodeMatch,
      error: bytecodeMatch ? undefined : 'Bytecode does not match ETH mainnet SafeSingletonFactory',
    };
  } catch (err) {
    return {
      chainId,
      factoryDeployed: false,
      bytecodeMatch: false,
      compatible: false,
      error: err instanceof Error ? err.message : 'Network unreachable',
    };
  }
}
