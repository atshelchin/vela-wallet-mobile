/**
 * Passkey (WebAuthn) native module — JS bridge.
 *
 * Exposes a unified API for passkey registration, authentication, and signing
 * across iOS (ASAuthorization) and Android (Credential Manager).
 *
 * Design principles:
 *   - All data crosses the bridge as hex strings (no base64 ambiguity)
 *   - Native side owns UIKit/Activity presentation, JS side owns business logic
 *   - Errors carry a typed code so callers can branch (cancelled vs. failed)
 *   - The module is stateless — no cached credentials or sessions
 */

import { NativeModules, Platform } from 'react-native';

const { VelaPasskey } = NativeModules;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Relying party identifier. Must match Associated Domains / assetlinks.json. */
export const RELYING_PARTY = 'getvela.app';

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export const PasskeyErrorCode = {
  /** User dismissed the biometric / passkey sheet. */
  CANCELLED: 'PASSKEY_CANCELLED',
  /** A general failure occurred in the passkey flow. */
  FAILED: 'PASSKEY_FAILED',
  /** No credential was returned by the platform. */
  NO_CREDENTIAL: 'PASSKEY_NO_CREDENTIAL',
  /** Passkeys are not supported on this device / OS version. */
  NOT_SUPPORTED: 'PASSKEY_NOT_SUPPORTED',
  /** The native module is not linked or the app has not been rebuilt. */
  NOT_AVAILABLE: 'PASSKEY_NOT_AVAILABLE',
} as const;

export type PasskeyErrorCode = (typeof PasskeyErrorCode)[keyof typeof PasskeyErrorCode];

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;

  constructor(code: PasskeyErrorCode, message: string) {
    super(message);
    this.name = 'PasskeyError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Returned by `register()`.
 *
 * All binary fields are lowercase hex strings (no 0x prefix).
 */
export interface PasskeyRegistrationResult {
  /** Credential identifier (hex). */
  credentialId: string;
  /** Raw attestation object containing the P-256 public key (hex, CBOR-encoded). */
  attestationObjectHex: string;
  /** Raw client data JSON (hex). */
  clientDataJSONHex: string;
}

/**
 * Returned by `authenticate()` and `sign()`.
 *
 * All binary fields are lowercase hex strings (no 0x prefix).
 */
export interface PasskeyAssertionResult {
  /** Credential identifier (hex). */
  credentialId: string;
  /** DER-encoded ECDSA signature (hex). Convert to raw r‖s with attestation-parser. */
  signatureHex: string;
  /** Raw authenticator data (hex). */
  authenticatorDataHex: string;
  /** Raw client data JSON (hex). */
  clientDataJSONHex: string;
  /** User handle / userID (hex). Present only on authenticate(), absent on sign(). */
  userIdHex?: string;
}

// ---------------------------------------------------------------------------
// UserID helpers (pure JS — usable without native module)
// ---------------------------------------------------------------------------

/**
 * Encode a username into the userID format used by Vela Wallet passkeys.
 *
 * Format: `"name\0uuid"` — mirrors iOS `PasskeyService.encodeUserID` and
 * Android `PasskeyService.encodeUserID`.
 */
export function encodeUserID(name: string): string {
  const uuid = generateUUID();
  return `${name}\0${uuid}`;
}

/**
 * Decode the username from a userID string.
 *
 * Returns everything before the first null byte.
 */
export function decodeUserName(userID: string): string {
  const idx = userID.indexOf('\0');
  return idx === -1 ? userID : userID.slice(0, idx);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether passkeys are supported on this device.
 *
 * Returns `false` if the native module is not linked or the OS does not support
 * platform authenticators (iOS < 16, Android < 9 without Play Services).
 */
export async function isSupported(): Promise<boolean> {
  if (!VelaPasskey) return false;
  try {
    return await VelaPasskey.isSupported();
  } catch {
    return false;
  }
}

/**
 * Register (create) a new passkey credential.
 *
 * Triggers biometric verification and creates a discoverable, platform-bound
 * P-256 credential with the configured relying party.
 *
 * @param userName - Display name for the credential (visible in system UI).
 * @returns Registration result containing the credential ID and attestation
 *          object (from which the P-256 public key can be extracted).
 * @throws {PasskeyError}
 */
export async function register(userName: string): Promise<PasskeyRegistrationResult> {
  assertAvailable();
  try {
    return await VelaPasskey.register(userName);
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Authenticate (login) with an existing passkey.
 *
 * Shows the system credential picker so the user can select a discoverable
 * credential. The resulting `userIdHex` can be decoded with `decodeUserName`
 * to recover the account name.
 *
 * @throws {PasskeyError}
 */
export async function authenticate(): Promise<PasskeyAssertionResult> {
  assertAvailable();
  try {
    return await VelaPasskey.authenticate();
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Sign arbitrary data using a passkey assertion.
 *
 * The `challengeHex` is passed as the WebAuthn challenge. For blockchain
 * signing, this is typically a 32-byte hash (e.g. SafeOp hash).
 *
 * @param challengeHex  - Data to sign (hex, no 0x prefix).
 * @param credentialId  - Optional credential ID (hex). When provided, the
 *                        system skips the picker and uses this credential
 *                        directly (iOS only; Android always shows picker).
 * @throws {PasskeyError}
 */
export async function sign(
  challengeHex: string,
  credentialId?: string | null,
): Promise<PasskeyAssertionResult> {
  assertAvailable();
  try {
    return await VelaPasskey.sign(challengeHex, credentialId ?? null);
  } catch (err) {
    throw normalizeError(err);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertAvailable(): void {
  if (!VelaPasskey) {
    throw new PasskeyError(
      PasskeyErrorCode.NOT_AVAILABLE,
      'VelaPasskey native module is not available. Ensure the module is linked and the app has been rebuilt.',
    );
  }
}

/**
 * Normalize a native error into a typed PasskeyError.
 *
 * React Native bridges propagate native exceptions as plain Error objects
 * whose `code` property carries the error code string set on the native side.
 */
function normalizeError(err: unknown): PasskeyError {
  if (err instanceof PasskeyError) return err;

  const raw = err as { code?: string; message?: string };
  const code = mapNativeCode(raw.code);
  const message = raw.message ?? 'Unknown passkey error';
  return new PasskeyError(code, message);
}

function mapNativeCode(code?: string): PasskeyErrorCode {
  switch (code) {
    case 'PASSKEY_CANCELLED':
      return PasskeyErrorCode.CANCELLED;
    case 'PASSKEY_NO_CREDENTIAL':
      return PasskeyErrorCode.NO_CREDENTIAL;
    case 'PASSKEY_NOT_SUPPORTED':
      return PasskeyErrorCode.NOT_SUPPORTED;
    default:
      return PasskeyErrorCode.FAILED;
  }
}

/** Generate a UUID v4. */
function generateUUID(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // version
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) | 8]; // variant
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
}
