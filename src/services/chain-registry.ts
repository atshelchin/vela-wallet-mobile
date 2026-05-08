/**
 * Chain info fetcher from ethereum-data API.
 *
 * Retrieves network metadata (name, native token, RPC, explorer)
 * for use when adding custom networks.
 */

const BASE_URL = 'https://ethereum-data.awesometools.dev';

export interface ChainInfo {
  chainId: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  explorerUrl: string;
  logoURL: string;
  isTestnet: boolean;
}

/**
 * Fetch chain info from ethereum-data API.
 * Returns null if the chain is not found or the API is unreachable.
 */
export async function fetchChainInfo(chainId: number): Promise<ChainInfo | null> {
  try {
    const res = await fetch(`${BASE_URL}/chains/${chainId}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return null;

    const data = await res.json();

    return {
      chainId: data.chainId ?? chainId,
      name: data.name ?? `Chain ${chainId}`,
      nativeCurrency: {
        name: data.nativeCurrency?.name ?? 'Ether',
        symbol: data.nativeCurrency?.symbol ?? 'ETH',
        decimals: data.nativeCurrency?.decimals ?? 18,
      },
      rpcUrl: extractRpcUrl(data),
      explorerUrl: extractExplorerUrl(data),
      logoURL: `${BASE_URL}/chains/${chainId}/logo.png`,
      isTestnet: data.testnet === true || data.isTestnet === true,
    };
  } catch {
    return null;
  }
}

function extractRpcUrl(data: any): string {
  if (Array.isArray(data.rpc) && data.rpc.length > 0) {
    // Prefer HTTPS URLs without API key placeholders
    const https = data.rpc.find((u: string) =>
      u.startsWith('https://') && !u.includes('${') && !u.includes('API_KEY'),
    );
    return https ?? data.rpc[0] ?? '';
  }
  return data.rpcUrl ?? data.rpc ?? '';
}

function extractExplorerUrl(data: any): string {
  if (Array.isArray(data.explorers) && data.explorers.length > 0) {
    return data.explorers[0].url ?? '';
  }
  return data.explorerUrl ?? data.explorer ?? '';
}
