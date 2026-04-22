/**
 * Client for WebAuthn P256 Public Key Index API.
 * Matches iOS PublicKeyIndexService.swift.
 */

const BASE_URL = 'https://webauthnp256-publickey-index.biubiu.tools';

export interface PublicKeyRecord {
  rpId: string;
  credentialId: string;
  publicKey: string;
  name: string;
  createdAt: number;
}

interface CreateRequest {
  rpId: string;
  credentialId: string;
  publicKey: string;
  challenge: string;
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
  name: string;
}

/** Fetch a one-time challenge (5-minute validity). */
export async function getChallenge(): Promise<string> {
  const response = await fetch(`${BASE_URL}/challenge`);
  if (!response.ok) throw new Error(`Challenge request failed: ${response.status}`);
  const data: { challenge: string } = await response.json();
  return data.challenge;
}

/** Store a public key record after passkey creation. */
export async function createRecord(request: CreateRequest): Promise<PublicKeyRecord> {
  const response = await fetch(`${BASE_URL}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create failed: ${response.status} ${text}`);
  }
  return response.json();
}

/** Query a public key by rpId and credentialId. */
export async function queryRecord(rpId: string, credentialId: string): Promise<PublicKeyRecord> {
  const url = `${BASE_URL}/credentials?rpId=${encodeURIComponent(rpId)}&credentialId=${encodeURIComponent(credentialId)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Query failed: ${response.status}`);
  return response.json();
}
