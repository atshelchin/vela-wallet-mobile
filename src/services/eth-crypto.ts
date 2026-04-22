/**
 * Pure TypeScript Ethereum cryptographic utilities.
 * Matches the iOS EthCrypto.swift implementation.
 *
 * - Keccak-256 (NOT SHA-3: uses 0x01 domain padding, not 0x06)
 * - ABI encoding helpers
 * - CREATE2 address computation
 * - EIP-55 checksum addresses
 */

import { toHex, fromHex, stripHexPrefix, concatBytes } from './hex';

// ---------------------------------------------------------------------------
// Keccak-256
// ---------------------------------------------------------------------------

const MASK64 = 0xFFFFFFFFFFFFFFFFn;

/** Keccak-f[1600] round constants. */
const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** pi-lane permutation indices. */
const PI_LANE = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

/** Rotation constants for rho step. */
const ROT_CONST = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];

/** 64-bit left rotate using BigInt. */
function rotl64(x: bigint, n: number): bigint {
  const nn = BigInt(n);
  return ((x << nn) | (x >> (64n - nn))) & MASK64;
}

/** Keccak-f[1600] permutation on a 25-word (64-bit) state. */
function keccakF1600(state: bigint[]): void {
  const c = new Array<bigint>(5);
  const d = new Array<bigint>(5);

  for (let round = 0; round < 24; round++) {
    // --- theta ---
    for (let x = 0; x < 5; x++) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 25; y += 5) {
        state[y + x] = (state[y + x] ^ d[x]) & MASK64;
      }
    }

    // --- rho + pi ---
    let last = state[1];
    for (let i = 0; i < 24; i++) {
      const j = PI_LANE[i];
      const temp = state[j];
      state[j] = rotl64(last, ROT_CONST[i]);
      last = temp;
    }

    // --- chi ---
    for (let y = 0; y < 25; y += 5) {
      const t0 = state[y];
      const t1 = state[y + 1];
      const t2 = state[y + 2];
      const t3 = state[y + 3];
      const t4 = state[y + 4];
      state[y]     = (t0 ^ (~t1 & t2)) & MASK64;
      state[y + 1] = (t1 ^ (~t2 & t3)) & MASK64;
      state[y + 2] = (t2 ^ (~t3 & t4)) & MASK64;
      state[y + 3] = (t3 ^ (~t4 & t0)) & MASK64;
      state[y + 4] = (t4 ^ (~t0 & t1)) & MASK64;
    }

    // --- iota ---
    state[0] = (state[0] ^ RC[round]) & MASK64;
  }
}

/** Read a 64-bit little-endian word from a byte array. */
function readLE64(data: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(data[offset + i]) << BigInt(i * 8);
  }
  return v;
}

/** Write a 64-bit little-endian word to a byte array. */
function writeLE64(data: Uint8Array, offset: number, value: bigint): void {
  for (let i = 0; i < 8; i++) {
    data[offset + i] = Number((value >> BigInt(i * 8)) & 0xFFn);
  }
}

/**
 * Keccak-256 hash.
 *
 * Uses Keccak padding (0x01) — NOT NIST SHA-3 (which uses 0x06).
 * Rate = 136 bytes, capacity = 64 bytes, output = 32 bytes.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136; // (1600 - 256 * 2) / 8

  // --- Padding ---
  // Append 0x01, then zeroes, then 0x80 at the last byte of the final block.
  const dataLen = data.length;
  const blocks = Math.floor(dataLen / rate);
  const remainder = dataLen % rate;

  // Padded message: we need at least 1 byte for 0x01 and the last byte must be 0x80.
  // If remainder == rate - 1, 0x01 and 0x80 share the same byte (0x81).
  const padLen = rate - remainder;
  const padded = new Uint8Array(dataLen + padLen);
  padded.set(data);
  padded[dataLen] = 0x01;
  padded[padded.length - 1] |= 0x80;

  // --- Absorb ---
  const state = new Array<bigint>(25).fill(0n);
  const totalBlocks = padded.length / rate;

  for (let b = 0; b < totalBlocks; b++) {
    const blockOffset = b * rate;
    for (let i = 0; i < rate; i += 8) {
      const wordIdx = i >> 3;
      state[wordIdx] = (state[wordIdx] ^ readLE64(padded, blockOffset + i)) & MASK64;
    }
    keccakF1600(state);
  }

  // --- Squeeze (32 bytes = 4 words) ---
  const hash = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    writeLE64(hash, i * 8, state[i]);
  }
  return hash;
}

/** Keccak-256 hash from a hex string (with or without 0x prefix). */
export function keccak256Hex(hex: string): Uint8Array {
  return keccak256(fromHex(hex));
}

// ---------------------------------------------------------------------------
// ABI Encoding
// ---------------------------------------------------------------------------

/**
 * ABI-encode an Ethereum address as a 32-byte word (left-padded with zeroes).
 * Accepts with or without 0x prefix.
 */
export function abiEncodeAddress(address: string): Uint8Array {
  const clean = stripHexPrefix(address).toLowerCase();
  if (clean.length !== 40) {
    throw new Error(`Invalid address length: expected 40 hex chars, got ${clean.length}`);
  }
  const result = new Uint8Array(32);
  const addrBytes = fromHex(clean);
  result.set(addrBytes, 12); // 32 - 20 = 12 bytes leading zeroes
  return result;
}

/**
 * ABI-encode a uint256 value as a 32-byte big-endian word.
 */
export function abiEncodeUint256(value: bigint | number): Uint8Array {
  let v = BigInt(value);
  if (v < 0n) throw new Error('uint256 must be non-negative');
  const result = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    result[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return result;
}

/**
 * ABI-encode a uint256 from a hex string (with or without 0x prefix).
 */
export function abiEncodeUint256Hex(hex: string): Uint8Array {
  const clean = stripHexPrefix(hex);
  return abiEncodeUint256(BigInt('0x' + clean));
}

/**
 * ABI-encode raw bytes as a bytes32 word (right-padded with zeroes).
 * Input must be <= 32 bytes.
 */
export function abiEncodeBytes32(data: Uint8Array): Uint8Array {
  if (data.length > 32) {
    throw new Error(`bytes32 data too long: ${data.length} bytes (max 32)`);
  }
  const result = new Uint8Array(32);
  result.set(data, 0); // right-pad with zeroes
  return result;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Compute a Solidity function selector: first 4 bytes of keccak256 of the
 * UTF-8 encoded function signature (e.g. "transfer(address,uint256)").
 */
export function functionSelector(signature: string): Uint8Array {
  const encoder = new TextEncoder();
  const hash = keccak256(encoder.encode(signature));
  return hash.slice(0, 4);
}

/**
 * Compute a CREATE2 address.
 *
 * address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
 *
 * @param factory   - deployer/factory contract address (hex, with or without 0x)
 * @param salt      - 32-byte salt
 * @param initCodeHash - 32-byte keccak256 hash of the init code
 * @returns checksummed address with 0x prefix
 */
export function create2Address(
  factory: string,
  salt: Uint8Array,
  initCodeHash: Uint8Array,
): string {
  if (salt.length !== 32) throw new Error(`salt must be 32 bytes, got ${salt.length}`);
  if (initCodeHash.length !== 32) throw new Error(`initCodeHash must be 32 bytes, got ${initCodeHash.length}`);

  const factoryBytes = fromHex(stripHexPrefix(factory));
  if (factoryBytes.length !== 20) throw new Error(`factory address must be 20 bytes, got ${factoryBytes.length}`);

  const payload = concatBytes(
    new Uint8Array([0xff]),
    factoryBytes,
    salt,
    initCodeHash,
  );

  const hash = keccak256(payload);
  const addrBytes = hash.slice(12); // last 20 bytes
  return checksumAddress('0x' + toHex(addrBytes));
}

/**
 * EIP-55 mixed-case checksum encoding for Ethereum addresses.
 *
 * @param address - hex address with or without 0x prefix
 * @returns checksummed address with 0x prefix
 */
export function checksumAddress(address: string): string {
  const clean = stripHexPrefix(address).toLowerCase();
  if (clean.length !== 40) {
    throw new Error(`Invalid address length: expected 40 hex chars, got ${clean.length}`);
  }

  const encoder = new TextEncoder();
  const hashHex = toHex(keccak256(encoder.encode(clean)));

  let result = '0x';
  for (let i = 0; i < 40; i++) {
    const c = clean[i];
    // If the character is a letter (a-f) and the corresponding nibble in the hash >= 8, uppercase it
    const hashNibble = parseInt(hashHex[i], 16);
    if (hashNibble >= 8 && c >= 'a' && c <= 'f') {
      result += c.toUpperCase();
    } else {
      result += c;
    }
  }
  return result;
}
