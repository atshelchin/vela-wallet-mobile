/**
 * API client for getvela.app endpoints.
 * Matches iOS WalletAPIService.swift.
 */
import type { APIToken, APINFT } from '@/models/types';

const BASE_URL = 'https://getvela.app/api';

export class APIError extends Error {
  constructor(message = 'Failed to fetch data from server.') {
    super(message);
    this.name = 'APIError';
  }
}

/** Fetch token balances across all supported networks. */
export async function fetchTokens(address: string): Promise<APIToken[]> {
  const url = `${BASE_URL}/wallet?address=${encodeURIComponent(address)}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new APIError(`/wallet failed: HTTP ${response.status}`);
  }

  const data: { tokens: APIToken[] } = await response.json();
  return data.tokens.filter(t => !t.spam);
}

/** Fetch NFTs across all supported networks. */
export async function fetchNFTs(address: string): Promise<APINFT[]> {
  const url = `${BASE_URL}/nft?address=${encodeURIComponent(address)}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new APIError(`/nft failed: HTTP ${response.status}`);
  }

  const data: { nfts: APINFT[] } = await response.json();
  return data.nfts;
}

/** Fetch USD to target currency exchange rate. */
export async function fetchExchangeRate(currency = 'CNY'): Promise<number> {
  const url = `${BASE_URL}/exchange-rate?currency=${encodeURIComponent(currency)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new APIError(`/exchange-rate failed: HTTP ${response.status}`);
  }

  const data: { currency: string; rate: number } = await response.json();
  return data.rate;
}
