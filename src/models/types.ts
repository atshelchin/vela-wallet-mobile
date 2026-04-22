/**
 * Core data models shared across the app.
 * Matches iOS WalletState.swift, WalletAPIService.swift models.
 */

// MARK: - Account

export interface Account {
  /** Passkey credential ID (hex string). */
  id: string;
  /** User-chosen display name. */
  name: string;
  /** Safe wallet address. */
  address: string;
  /** Account creation timestamp (ISO string). */
  createdAt: string;
}

// MARK: - Stored Account (with public key for signing)

export interface StoredAccount extends Account {
  /** Uncompressed P256 public key hex (04 || x || y). */
  publicKeyHex: string;
}

// MARK: - Pending Upload

export interface PendingUpload {
  /** Credential ID (hex). */
  id: string;
  name: string;
  publicKeyHex: string;
  attestationObjectHex: string;
  createdAt: string;
}

// MARK: - API Token

export interface APIToken {
  network: string;
  chainName: string;
  symbol: string;
  balance: string;
  decimals: number;
  logo: string | null;
  name: string;
  tokenAddress: string | null;
  priceUsd: number | null;
  spam: boolean;
}

/** Computed properties for APIToken. */
export function tokenId(t: APIToken): string {
  return `${t.network}_${t.tokenAddress ?? 'native'}_${t.symbol}`;
}

export function isNativeToken(t: APIToken): boolean {
  return t.tokenAddress == null;
}

export function tokenBalanceDouble(t: APIToken): number {
  return parseFloat(t.balance) || 0;
}

export function tokenUsdValue(t: APIToken): number {
  return tokenBalanceDouble(t) * (t.priceUsd ?? 0);
}

export function tokenChainId(t: APIToken): number {
  switch (t.network) {
    case 'eth-mainnet': return 1;
    case 'arb-mainnet': return 42161;
    case 'base-mainnet': return 8453;
    case 'opt-mainnet': return 10;
    case 'matic-mainnet': return 137;
    case 'bnb-mainnet': return 56;
    case 'avax-mainnet': return 43114;
    default: return 1;
  }
}

export function tokenLogoURL(t: APIToken): string | null {
  if (t.logo && t.logo.length > 0) return t.logo;
  const cid = tokenChainId(t);
  if (isNativeToken(t)) {
    return `https://ethereum-data.awesometools.dev/chainlogos/eip155-${cid}.png`;
  }
  if (t.tokenAddress) {
    return `https://ethereum-data.awesometools.dev/assets/eip155-${cid}/${t.tokenAddress}/logo.png`;
  }
  return null;
}

// MARK: - API NFT

export interface APINFT {
  network: string;
  chainName: string;
  contractAddress: string;
  tokenId: string;
  name: string | null;
  description: string | null;
  image: string | null;
  tokenType: string;
  collectionName: string | null;
  collectionImage: string | null;
}

export function nftId(n: APINFT): string {
  return `${n.network}_${n.contractAddress}_${n.tokenId}`;
}

export function nftDisplayName(n: APINFT): string {
  return n.name ?? `${n.collectionName ?? 'NFT'} #${n.tokenId}`;
}

export function nftImageURL(n: APINFT): string | null {
  if (!n.image) return null;
  if (n.image.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${n.image.slice(7)}`;
  }
  return n.image;
}

// MARK: - Custom Token

export interface CustomToken {
  id: string; // "{chainId}_{contractAddress}"
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  networkName: string;
}

// MARK: - Network Config

export interface NetworkConfig {
  chainId: number;
  rpcURL: string;
  explorerURL: string;
  bundlerURL: string;
}

// MARK: - BLE Message Types

export interface BLEIncomingRequest {
  id: string;
  method: string;
  params: any[];
  origin: string;
  favicon?: string;
}

export interface BLEOutgoingResponse {
  id: string;
  result?: any;
  error?: BLEError;
}

export interface BLEError {
  code: number;
  message: string;
}

// MARK: - Transaction Result

export interface TransactionResult {
  userOpHash: string;
  txHash: string;
}

// MARK: - Utility Functions

/** Format a balance with appropriate precision. */
export function formatBalance(value: number): string {
  if (value === 0) return '0';
  if (value >= 1000) return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return value.toPrecision(4);
}

/** Shorten an address to "0x1234...abcd" format. */
export function shortAddr(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}
