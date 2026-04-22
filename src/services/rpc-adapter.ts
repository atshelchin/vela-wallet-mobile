/**
 * JSON-RPC adapter with fallback routing.
 * Matches iOS RPCAdapter.swift.
 *
 * Routes: user-configured URL → getvela.app proxy → public RPC.
 */
import { DEFAULT_NETWORKS } from '@/models/network';
import { getNetworkConfig } from './storage';

const PROXY_URL = 'https://getvela.app/api/proxy';
const BUNDLER_PROXY_URL = 'https://getvela.app/api/bundler';

/** Standard JSON-RPC methods that go through the RPC endpoint. */
const RPC_METHODS = new Set([
  'eth_call', 'eth_getCode', 'eth_getBalance', 'eth_gasPrice',
  'eth_blockNumber', 'eth_getTransactionByHash', 'eth_getTransactionReceipt',
  'eth_estimateGas', 'eth_getBlockByNumber', 'eth_chainId',
]);

/** ERC-4337 bundler methods. */
const BUNDLER_METHODS = new Set([
  'eth_sendUserOperation', 'eth_estimateUserOperationGas',
  'eth_getUserOperationReceipt', 'eth_getUserOperationByHash',
  'pimlico_getUserOperationGasPrice',
]);

interface RPCResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

/** Make a JSON-RPC call with fallback routing. */
export async function rpcCall(
  method: string,
  params: any[],
  chainId: number,
): Promise<RPCResponse> {
  const isBundler = BUNDLER_METHODS.has(method);

  // Build endpoint list (prioritized)
  const endpoints = await getEndpoints(chainId, isBundler);

  let lastError: Error | null = null;
  for (const url of endpoints) {
    try {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      return await response.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('All RPC endpoints failed');
}

/** Get prioritized endpoint list for a chain. */
async function getEndpoints(chainId: number, isBundler: boolean): Promise<string[]> {
  const endpoints: string[] = [];

  // 1. User-configured
  const config = await getNetworkConfig(chainId);
  if (config) {
    const url = isBundler ? config.bundlerURL : config.rpcURL;
    if (url) endpoints.push(url);
  }

  // 2. Proxy
  const proxyUrl = isBundler ? BUNDLER_PROXY_URL : PROXY_URL;
  const proxyWithChain = `${proxyUrl}?chainId=${chainId}`;
  endpoints.push(proxyWithChain);

  // 3. Default public RPC (non-bundler only)
  if (!isBundler) {
    const network = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
    if (network) endpoints.push(network.rpcURL);
  }

  return endpoints;
}
