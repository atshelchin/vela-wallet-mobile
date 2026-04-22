/**
 * JSON-RPC adapter with fallback routing.
 * Matches iOS RPCAdapter.swift.
 *
 * Routes: user-configured URL → getvela.app proxy → public RPC.
 */
import { DEFAULT_NETWORKS, networkId } from '@/models/network';
import { getNetworkConfig } from './storage';

/** All RPC and bundler calls go through this single proxy endpoint. */
const PROXY_URL = 'https://getvela.app/api/bundler';

/** ERC-4337 bundler methods (routed to Pimlico via proxy). */
const BUNDLER_METHODS = new Set([
  'eth_sendUserOperation', 'eth_estimateUserOperationGas',
  'eth_getUserOperationReceipt', 'eth_getUserOperationByHash',
  'pimlico_getUserOperationGasPrice',
]);

/** Standard RPC methods (routed to Alchemy via proxy). */
const RPC_METHODS = new Set([
  'eth_call', 'eth_getCode', 'eth_getBalance', 'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
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

  // 1. Try user-configured endpoint (only if customized, not bare Pimlico)
  const userUrl = await getUserEndpoint(chainId, isBundler);
  if (userUrl) {
    try {
      const result = await directRPC(userUrl, method, params);
      if (result) return result;
    } catch { /* fall through */ }
  }

  // 2. getvela.app proxy (always works — has API keys server-side)
  //    Body format: { method, params, network } — matches iOS RPCAdapter.proxyRPC
  try {
    const result = await proxyRPC(method, params, chainId);
    if (result) return result;
  } catch { /* fall through */ }

  // 3. Public RPC fallback (non-bundler only)
  if (!isBundler) {
    const network = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
    if (network) {
      const result = await directRPC(network.rpcURL, method, params);
      if (result) return result;
    }
  }

  throw new Error('All RPC endpoints failed');
}

/** Direct JSON-RPC call to a specific URL. */
async function directRPC(
  url: string,
  method: string,
  params: any[],
): Promise<RPCResponse | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!response.ok) return null;
  return response.json();
}

/**
 * Proxy RPC call via getvela.app/api/bundler.
 *
 * The proxy accepts { method, params, network } in the POST body.
 * `network` is a string like "eth-mainnet", "arb-mainnet", etc.
 * The proxy routes bundler methods to Pimlico and RPC methods to Alchemy,
 * both with API keys stored server-side.
 */
async function proxyRPC(
  method: string,
  params: any[],
  chainId: number,
): Promise<RPCResponse | null> {
  const network = networkId(chainId); // e.g. "eth-mainnet", "arb-mainnet"

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params, network }),
  });

  if (!response.ok) return null;
  return response.json();
}

/** Get user-configured endpoint if they've customized it (not the default). */
async function getUserEndpoint(
  chainId: number,
  isBundler: boolean,
): Promise<string | null> {
  const config = await getNetworkConfig(chainId);
  if (!config) return null;

  const defaultNet = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
  const url = isBundler ? config.bundlerURL : config.rpcURL;

  // Only use if user has actually customized it (not the default value)
  if (!url) return null;
  const defaultUrl = isBundler ? defaultNet?.bundlerURL : defaultNet?.rpcURL;
  if (url === defaultUrl) return null;

  // Skip bare Pimlico URLs without API key
  if (url.includes('pimlico.io') && !url.includes('apikey')) return null;

  return url;
}
