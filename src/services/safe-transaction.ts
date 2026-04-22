/**
 * Builds, signs, and submits ERC-4337 UserOperations for Safe wallets.
 * TypeScript port of SafeTransactionService.swift.
 */

import {
  keccak256,
  abiEncodeAddress,
  abiEncodeUint256,
  abiEncodeUint256Hex,
  abiEncodeBytes32,
  functionSelector,
} from './eth-crypto';

import { toHex, fromHex, concatBytes, stripHexPrefix } from './hex';

import {
  SAFE_SINGLETON,
  SAFE_PROXY_FACTORY,
  ENTRY_POINT,
  SAFE_4337_MODULE,
  WEBAUTHN_SIGNER,
  SAFE_MODULE_SETUP,
  parsePublicKey,
  encodeSetupData,
  calculateSaltNonce,
} from './safe-address';

import { rpcCall } from './rpc-adapter';
import { derSignatureToRaw } from './attestation-parser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERIFICATION_GAS_DEPLOYED = 300_000n;
const VERIFICATION_GAS_UNDEPLOYED = 600_000n;
const CALL_GAS_LIMIT = 150_000n;
const PRE_VERIFICATION_GAS = 60_000n;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserOperation {
  sender: string;
  nonce: string;
  initCode: Uint8Array;
  callData: Uint8Array;
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Uint8Array;
  signature: Uint8Array;
}

export interface TransactionResult {
  userOpHash: string;
  txHash: string;
}

interface GasEstimate {
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
}

type SignFn = (challenge: Uint8Array) => Promise<{
  signature: Uint8Array;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
}>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Send native token (ETH, POL, BNB, etc.) */
export async function sendNative(
  from: string,
  to: string,
  valueWei: string,
  chainId: number,
  publicKeyHex: string,
  signFn: SignFn,
): Promise<TransactionResult> {
  const callData = buildExecuteCallData(to, valueWei, new Uint8Array(0));
  return sendUserOp(from, callData, chainId, publicKeyHex, signFn);
}

/** Send ERC-20 token. */
export async function sendERC20(
  from: string,
  tokenAddress: string,
  to: string,
  amountWei: string,
  chainId: number,
  publicKeyHex: string,
  signFn: SignFn,
): Promise<TransactionResult> {
  const transferSelector = functionSelector('transfer(address,uint256)');
  const transferData = concatBytes(
    transferSelector,
    abiEncodeAddress(to),
    abiEncodeUint256Hex(amountWei),
  );

  const callData = buildExecuteCallData(tokenAddress, '0', transferData);
  return sendUserOp(from, callData, chainId, publicKeyHex, signFn);
}

/** Send arbitrary contract call (e.g. dApp interaction like swap). */
export async function sendContractCall(
  from: string,
  to: string,
  valueWei: string,
  data: Uint8Array,
  chainId: number,
  publicKeyHex: string,
  signFn: SignFn,
): Promise<TransactionResult> {
  const callData = buildExecuteCallData(to, valueWei, data);
  return sendUserOp(from, callData, chainId, publicKeyHex, signFn);
}

// ---------------------------------------------------------------------------
// Core UserOp Flow
// ---------------------------------------------------------------------------

async function sendUserOp(
  safeAddress: string,
  callData: Uint8Array,
  chainId: number,
  publicKeyHex: string,
  signFn: SignFn,
): Promise<TransactionResult> {
  // 1. Check if deployed
  const deployed = await isDeployed(safeAddress, chainId);

  // 2. Build initCode if needed
  const initCode: Uint8Array = deployed
    ? new Uint8Array(0)
    : buildInitCode(publicKeyHex);

  // 3. Get nonce (0 for undeployed wallets)
  const nonce: string = deployed
    ? await getNonce(safeAddress, chainId)
    : '0x0';

  // 4. Get gas prices
  const { maxFee, maxPriority } = await getGasPrices(chainId);

  // 5. Initial gas estimates
  const verificationGas = deployed
    ? VERIFICATION_GAS_DEPLOYED
    : VERIFICATION_GAS_UNDEPLOYED;

  // 6. Build dummy UserOp for gas estimation
  const dummySig = buildDummySignature();
  const userOp: UserOperation = {
    sender: safeAddress,
    nonce,
    initCode,
    callData,
    verificationGasLimit: verificationGas,
    callGasLimit: CALL_GAS_LIMIT,
    preVerificationGas: PRE_VERIFICATION_GAS,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: maxPriority,
    paymasterAndData: new Uint8Array(0),
    signature: dummySig,
  };

  // 7. Estimate gas via bundler
  try {
    const estimated = await estimateGas(userOp, chainId);
    userOp.verificationGasLimit = bigintMax(
      userOp.verificationGasLimit,
      (estimated.verificationGasLimit * 13n) / 10n,
    );
    userOp.callGasLimit = bigintMax(
      userOp.callGasLimit,
      (estimated.callGasLimit * 13n) / 10n,
    );
    userOp.preVerificationGas = bigintMax(
      userOp.preVerificationGas,
      estimated.preVerificationGas + 5000n,
    );
  } catch {
    // Use default gas values
  }

  // 8. Calculate SafeOp hash (EIP-712)
  const safeOpHash = calculateSafeOpHash(userOp, chainId);

  // 9. Sign with passkey
  const assertion = await signFn(safeOpHash);

  // 10. Build real signature
  const rawSig = derSignatureToRaw(assertion.signature);
  if (!rawSig) {
    throw new Error('Failed to create signature: DER to raw conversion failed');
  }

  const clientDataFields = extractClientDataFields(assertion.clientDataJSON);

  const sigR = rawSig.slice(0, 32);
  const sigS = rawSig.slice(32);

  const realSig = buildUserOpSignature(
    assertion.authenticatorData,
    clientDataFields,
    sigR,
    sigS,
  );
  userOp.signature = realSig;

  // 11. Submit to bundler
  const userOpHash = await submitUserOp(userOp, chainId);

  // 12. Wait for receipt
  const txHash = await waitForReceipt(userOpHash, chainId);

  return { userOpHash, txHash };
}

// ---------------------------------------------------------------------------
// CallData
// ---------------------------------------------------------------------------

/** Encode Safe.executeUserOp(address to, uint256 value, bytes data, uint8 operation) */
function buildExecuteCallData(
  to: string,
  value: string,
  data: Uint8Array,
): Uint8Array {
  const selector = functionSelector(
    'executeUserOp(address,uint256,bytes,uint8)',
  );
  const toEncoded = abiEncodeAddress(to);
  const valueEncoded = abiEncodeUint256Hex(value);
  const dataOffset = abiEncodeUint256(128n); // 4 * 32 bytes
  const operation = abiEncodeUint256(0n); // CALL
  const dataLen = abiEncodeUint256(BigInt(data.length));
  const paddingLen = (32 - (data.length % 32)) % 32;
  const dataPadding = new Uint8Array(paddingLen);

  return concatBytes(
    selector,
    toEncoded,
    valueEncoded,
    dataOffset,
    operation,
    dataLen,
    data,
    dataPadding,
  );
}

// ---------------------------------------------------------------------------
// InitCode
// ---------------------------------------------------------------------------

function buildInitCode(publicKeyHex: string): Uint8Array {
  const { x, y } = parsePublicKey(publicKeyHex);
  const setupData = encodeSetupData(x, y);
  const saltNonce = calculateSaltNonce(x, y);

  // createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce)
  const selector = functionSelector(
    'createProxyWithNonce(address,bytes,uint256)',
  );
  const singletonEncoded = abiEncodeAddress(SAFE_SINGLETON);
  const dataOffset = abiEncodeUint256(96n); // 3 * 32
  const saltEncoded = abiEncodeBytes32(saltNonce);
  const dataLen = abiEncodeUint256(BigInt(setupData.length));
  const paddingLen = (32 - (setupData.length % 32)) % 32;
  const dataPadding = new Uint8Array(paddingLen);

  const createData = concatBytes(
    selector,
    singletonEncoded,
    dataOffset,
    saltEncoded,
    dataLen,
    setupData,
    dataPadding,
  );

  const factoryBytes = fromHex(stripHexPrefix(SAFE_PROXY_FACTORY));
  return concatBytes(factoryBytes, createData);
}

// ---------------------------------------------------------------------------
// SafeOp Hash (EIP-712)
// ---------------------------------------------------------------------------

function calculateSafeOpHash(
  userOp: UserOperation,
  chainId: number,
): Uint8Array {
  const encoder = new TextEncoder();

  const typeHash = keccak256(
    encoder.encode(
      'SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)',
    ),
  );

  const structHash = keccak256(
    concatBytes(
      typeHash,
      abiEncodeAddress(userOp.sender),
      abiEncodeUint256Hex(userOp.nonce),
      keccak256(userOp.initCode), // hash of dynamic
      keccak256(userOp.callData), // hash of dynamic
      abiEncodeUint256(userOp.verificationGasLimit),
      abiEncodeUint256(userOp.callGasLimit),
      abiEncodeUint256(userOp.preVerificationGas),
      abiEncodeUint256(userOp.maxPriorityFeePerGas),
      abiEncodeUint256(userOp.maxFeePerGas),
      keccak256(userOp.paymasterAndData), // hash of dynamic
      abiEncodeUint256(0n), // validAfter
      abiEncodeUint256(0n), // validUntil
      abiEncodeAddress(ENTRY_POINT),
    ),
  );

  // Domain separator
  const domainTypeHash = keccak256(
    encoder.encode('EIP712Domain(uint256 chainId,address verifyingContract)'),
  );
  const domainSeparator = keccak256(
    concatBytes(
      domainTypeHash,
      abiEncodeUint256(BigInt(chainId)),
      abiEncodeAddress(SAFE_4337_MODULE),
    ),
  );

  // Final hash: keccak256(0x1901 || domainSeparator || structHash)
  return keccak256(
    concatBytes(new Uint8Array([0x19, 0x01]), domainSeparator, structHash),
  );
}

// ---------------------------------------------------------------------------
// WebAuthn Signature
// ---------------------------------------------------------------------------

/**
 * Extract clientDataFields from clientDataJSON.
 *
 * clientDataJSON format:
 *   {"type":"webauthn.get","challenge":"<b64url>","origin":"https://...","crossOrigin":false}
 *
 * clientDataFields = everything after challenge's closing `",` up to (but not including) final `}`
 *   e.g.: "origin":"https://getvela.app","crossOrigin":false
 *
 * The contract template already includes `,"` before this, so we must NOT include the leading comma.
 */
function extractClientDataFields(clientDataJSON: Uint8Array): string {
  const decoder = new TextDecoder();
  const json = decoder.decode(clientDataJSON);

  // Find "challenge":"
  const key = '"challenge":"';
  const keyIndex = json.indexOf(key);
  if (keyIndex === -1) return '';

  // Find the closing quote of the challenge value
  const valueStart = keyIndex + key.length;
  let searchIndex = valueStart;
  while (searchIndex < json.length) {
    if (json[searchIndex] === '"') break;
    searchIndex++;
  }
  if (searchIndex >= json.length) return '';

  // Skip 2 chars: closing `"` and `,` -> start at the next field
  const skipIndex = searchIndex + 2;
  // Take everything up to the final `}`
  const endIndex = json.length - 1; // skip `}`
  if (skipIndex >= endIndex) return '';

  return json.slice(skipIndex, endIndex);
}

/**
 * Build contract signature for SafeWebAuthnSharedSigner.
 *
 * Format: validAfter(6) + validUntil(6) + r(32) + s(32) + v(1) + dataLength(32) + dynamicData
 * Where r = signer address padded, s = 65 (offset), v = 0x00 (contract sig type)
 * dynamicData = abi.encode(bytes authenticatorData, string clientDataFields, uint256 sigR, uint256 sigS)
 */
function buildUserOpSignature(
  authenticatorData: Uint8Array,
  clientDataFields: string,
  sigR: Uint8Array,
  sigS: Uint8Array,
): Uint8Array {
  // Validity window: validAfter(6) + validUntil(6) = 12 bytes of zeros
  const validityPadding = new Uint8Array(12);

  // Contract signature header: r(32) + s(32) + v(1)
  const rField = abiEncodeAddress(WEBAUTHN_SIGNER); // r = signer address
  const sField = abiEncodeUint256(65n); // s = offset to dynamic data (after r+s+v)
  const vField = new Uint8Array([0x00]); // v = 0x00 = contract signature

  // Dynamic data: abi.encode(bytes, string, uint256, uint256)
  const dynamicData = abiEncodeWebAuthnSig(
    authenticatorData,
    clientDataFields,
    sigR,
    sigS,
  );
  const dataLength = abiEncodeUint256(BigInt(dynamicData.length));

  return concatBytes(
    validityPadding,
    rField,
    sField,
    vField,
    dataLength,
    dynamicData,
  );
}

/**
 * ABI encode: (bytes authenticatorData, string clientDataFields, uint256 r, uint256 s)
 * Matches: encodeAbiParameters([{type:'bytes'},{type:'string'},{type:'uint256'},{type:'uint256'}], ...)
 */
function abiEncodeWebAuthnSig(
  authenticatorData: Uint8Array,
  clientDataFields: string,
  r: Uint8Array,
  s: Uint8Array,
): Uint8Array {
  const encoder = new TextEncoder();
  const clientFieldsBytes = encoder.encode(clientDataFields);

  // Head: 4 slots (offsets for dynamic types, inline for static types)
  // slot 0: offset to authenticatorData (bytes) = 4 * 32 = 128
  // slot 1: offset to clientDataFields (string) = calculated after authData
  // slot 2: r (uint256, inline)
  // slot 3: s (uint256, inline)

  // Tail parts
  // authenticatorData: length(32) + padded data
  const authPadLen = (32 - (authenticatorData.length % 32)) % 32;
  const authTail = concatBytes(
    abiEncodeUint256(BigInt(authenticatorData.length)),
    authenticatorData,
    new Uint8Array(authPadLen),
  );

  // clientDataFields: length(32) + padded data
  const clientPadLen = (32 - (clientFieldsBytes.length % 32)) % 32;
  const clientTail = concatBytes(
    abiEncodeUint256(BigInt(clientFieldsBytes.length)),
    clientFieldsBytes,
    new Uint8Array(clientPadLen),
  );

  const authDataOffset = 128n; // 4 * 32
  const clientDataOffset = authDataOffset + BigInt(authTail.length);

  return concatBytes(
    abiEncodeUint256(authDataOffset),
    abiEncodeUint256(clientDataOffset),
    abiEncodeBytes32(r),
    abiEncodeBytes32(s),
    authTail,
    clientTail,
  );
}

/** Build a dummy signature for gas estimation. */
function buildDummySignature(): Uint8Array {
  const validityPadding = new Uint8Array(12);
  const rField = abiEncodeAddress(WEBAUTHN_SIGNER);
  const sField = abiEncodeUint256(65n);
  const vField = new Uint8Array([0x00]);

  const fakeAuthData = concatBytes(
    new Uint8Array([0x01]),
    new Uint8Array(36), // 37 bytes total, right-padded
  );
  const fakeClientFields =
    '"origin":"https://getvela.app","crossOrigin":false';
  const fakeR = new Uint8Array(32);
  fakeR[31] = 0x01;
  const fakeS = new Uint8Array(32);
  fakeS[31] = 0x01;

  const dynamicData = abiEncodeWebAuthnSig(
    fakeAuthData,
    fakeClientFields,
    fakeR,
    fakeS,
  );
  const dataLength = abiEncodeUint256(BigInt(dynamicData.length));

  return concatBytes(
    validityPadding,
    rField,
    sField,
    vField,
    dataLength,
    dynamicData,
  );
}

// ---------------------------------------------------------------------------
// Bundler RPC Calls
// ---------------------------------------------------------------------------

async function isDeployed(
  address: string,
  chainId: number,
): Promise<boolean> {
  const response = await rpcCall('eth_getCode', [address, 'latest'], chainId);
  const result = response.result as string | undefined;
  return !!result && result !== '0x' && result.length > 2;
}

async function getNonce(
  safeAddress: string,
  chainId: number,
): Promise<string> {
  const selector = toHex(functionSelector('getNonce(address,uint192)'));
  const addressEncoded = toHex(abiEncodeAddress(safeAddress));
  const keyEncoded = toHex(abiEncodeUint256(0n));
  const callData = '0x' + selector + addressEncoded + keyEncoded;

  const response = await rpcCall(
    'eth_call',
    [{ to: ENTRY_POINT, data: callData }, 'latest'],
    chainId,
  );

  const result = response.result as string | undefined;
  return result ?? '0x0';
}

async function getGasPrices(
  chainId: number,
): Promise<{ maxFee: bigint; maxPriority: bigint }> {
  // Try pimlico_getUserOperationGasPrice first (recommended by Pimlico)
  try {
    const response = await rpcCall(
      'pimlico_getUserOperationGasPrice',
      [],
      chainId,
    );
    const result = response.result as
      | { fast?: { maxFeePerGas?: string; maxPriorityFeePerGas?: string } }
      | undefined;

    if (result?.fast?.maxFeePerGas && result?.fast?.maxPriorityFeePerGas) {
      const maxFee = parseHexUInt64(result.fast.maxFeePerGas);
      const maxPriority = parseHexUInt64(result.fast.maxPriorityFeePerGas);
      if (maxFee > 0n) {
        return { maxFee, maxPriority };
      }
    }
  } catch {
    // Fall through to eth_gasPrice
  }

  // Fallback: eth_gasPrice * 1.5
  try {
    const response = await rpcCall('eth_gasPrice', [], chainId);
    const result = response.result as string | undefined;
    if (result) {
      const gasPrice = parseHexUInt64(result);
      return { maxFee: (gasPrice * 3n) / 2n, maxPriority: gasPrice };
    }
  } catch {
    // Use defaults
  }

  return {
    maxFee: 50_000_000_000n,
    maxPriority: 25_000_000_000n,
  };
}

async function estimateGas(
  userOp: UserOperation,
  chainId: number,
): Promise<GasEstimate> {
  const response = await rpcCall(
    'eth_estimateUserOperationGas',
    [userOpToDict(userOp), ENTRY_POINT],
    chainId,
  );

  const result = response.result as Record<string, string> | undefined;
  if (!result) {
    throw new Error('Failed to estimate gas');
  }

  return {
    verificationGasLimit: parseHexUInt64(result.verificationGasLimit),
    callGasLimit: parseHexUInt64(result.callGasLimit),
    preVerificationGas: parseHexUInt64(result.preVerificationGas),
  };
}

async function submitUserOp(
  userOp: UserOperation,
  chainId: number,
): Promise<string> {
  const response = await rpcCall(
    'eth_sendUserOperation',
    [userOpToDict(userOp), ENTRY_POINT],
    chainId,
  );

  const result = response.result as string | undefined;
  if (!result) {
    const error = response.error;
    throw new Error(
      `Transaction failed: ${error ? JSON.stringify(error) : 'Unknown error'}`,
    );
  }

  return result;
}

async function waitForReceipt(
  userOpHash: string,
  chainId: number,
  timeout: number = 120_000,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const response = await rpcCall(
      'eth_getUserOperationReceipt',
      [userOpHash],
      chainId,
    );

    const result = response.result as
      | { receipt?: { transactionHash?: string } }
      | undefined;
    if (result?.receipt?.transactionHash) {
      return result.receipt.transactionHash;
    }

    await sleep(1500);
  }

  throw new Error('Transaction timed out waiting for confirmation');
}

// ---------------------------------------------------------------------------
// UserOp Serialization
// ---------------------------------------------------------------------------

/**
 * Convert UserOperation to JSON-RPC format.
 * ERC-4337 v0.7 uses individual fields + factory/factoryData split.
 */
function userOpToDict(userOp: UserOperation): Record<string, string> {
  const dict: Record<string, string> = {
    sender: userOp.sender,
    nonce: userOp.nonce,
    callData: '0x' + toHex(userOp.callData),
    callGasLimit: '0x' + userOp.callGasLimit.toString(16),
    verificationGasLimit: '0x' + userOp.verificationGasLimit.toString(16),
    preVerificationGas: '0x' + userOp.preVerificationGas.toString(16),
    maxFeePerGas: '0x' + userOp.maxFeePerGas.toString(16),
    maxPriorityFeePerGas: '0x' + userOp.maxPriorityFeePerGas.toString(16),
    signature: '0x' + toHex(userOp.signature),
  };

  // v0.7: split initCode into factory + factoryData
  if (userOp.initCode.length >= 20) {
    dict.factory = '0x' + toHex(userOp.initCode.slice(0, 20));
    dict.factoryData = '0x' + toHex(userOp.initCode.slice(20));
  }

  // v0.7: split paymasterAndData
  if (userOp.paymasterAndData.length >= 20) {
    dict.paymaster = '0x' + toHex(userOp.paymasterAndData.slice(0, 20));
    dict.paymasterData = '0x' + toHex(userOp.paymasterAndData.slice(20));
    dict.paymasterVerificationGasLimit = '0x0';
    dict.paymasterPostOpGasLimit = '0x0';
  }

  return dict;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHexUInt64(value: string | undefined): bigint {
  if (!value) return 0n;
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!clean) return 0n;
  return BigInt('0x' + clean);
}

function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
