/**
 * Uploads passkey public keys to the index server for cross-device recovery.
 *
 * Flow: getChallenge → Passkey.sign(challenge) → DER→raw → createRecord
 *
 * Matches iOS CreateWalletView.uploadPublicKey() and
 * ContentView.retryPendingUploads().
 */
import * as PublicKeyIndex from './public-key-index';
import * as Passkey from '@/modules/passkey';
import { derSignatureToRaw } from './attestation-parser';
import { fromHex, toHex, toBase64Url } from './hex';
import { loadPendingUploads, removePendingUpload } from './storage';

/**
 * Upload a public key to the index server.
 *
 * 1. Fetch a one-time challenge from the server
 * 2. Sign the challenge with the passkey (triggers biometric)
 * 3. Convert DER signature to raw r‖s
 * 4. Submit to the server with attestation proof
 * 5. Remove from pending uploads on success
 */
export async function uploadPublicKey(params: {
  credentialId: string;
  publicKeyHex: string;
  name: string;
}): Promise<void> {
  const { credentialId, publicKeyHex, name } = params;

  // 1. Get challenge from server
  const challenge = await PublicKeyIndex.getChallenge();

  // 2. Sign the challenge with passkey
  // The challenge is a plain string — convert to hex for the native module
  const challengeHex = toHex(new TextEncoder().encode(challenge));
  const assertion = await Passkey.sign(challengeHex);

  // 3. Convert DER signature to raw r‖s (64 bytes)
  const derBytes = fromHex(assertion.signatureHex);
  const rawSig = derSignatureToRaw(derBytes);
  if (!rawSig) {
    throw new Error('Failed to convert DER signature to raw format');
  }

  // 4. Prepare authenticatorData and clientDataJSON as base64url
  const authDataB64 = toBase64Url(fromHex(assertion.authenticatorDataHex));
  const clientDataB64 = toBase64Url(fromHex(assertion.clientDataJSONHex));

  // 5. Upload to server
  await PublicKeyIndex.createRecord({
    rpId: Passkey.RELYING_PARTY,
    credentialId,
    publicKey: publicKeyHex,
    challenge,
    signature: toHex(rawSig),
    authenticatorData: authDataB64,
    clientDataJSON: clientDataB64,
    name,
  });

  // 6. Remove from pending uploads
  await removePendingUpload(credentialId);
}

/**
 * Retry all pending public key uploads.
 *
 * Called on app startup and when the user manually retries.
 * Each upload triggers a biometric prompt.
 */
export async function retryPendingUploads(): Promise<{
  succeeded: number;
  failed: number;
}> {
  const pending = await loadPendingUploads();
  let succeeded = 0;
  let failed = 0;

  for (const upload of pending) {
    try {
      await uploadPublicKey({
        credentialId: upload.id,
        publicKeyHex: upload.publicKeyHex,
        name: upload.name,
      });
      succeeded++;
    } catch {
      failed++;
    }
  }

  return { succeeded, failed };
}
