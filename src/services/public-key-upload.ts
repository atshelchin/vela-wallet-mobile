/**
 * Uploads passkey public keys to the index server for cross-device recovery.
 *
 * Flow: getChallenge → Passkey.sign(challenge) → DER→raw → createRecord
 */
import * as PublicKeyIndex from './public-key-index';
import * as Passkey from '@/modules/passkey';
import { derSignatureToRaw } from './attestation-parser';
import { fromHex, toHex, toBase64Url } from './hex';
import { loadPendingUploads, removePendingUpload } from './storage';

/**
 * Upload a public key to the index server.
 */
export async function uploadPublicKey(params: {
  credentialId: string;
  publicKeyHex: string;
  name: string;
}): Promise<void> {
  const { credentialId, publicKeyHex, name } = params;

  console.log('[PublicKeyUpload] Starting upload for:', name);
  console.log('[PublicKeyUpload] credentialId:', credentialId.slice(0, 16) + '...');
  console.log('[PublicKeyUpload] publicKeyHex length:', publicKeyHex.length);

  // 1. Get challenge from server
  console.log('[PublicKeyUpload] Fetching challenge...');
  const challenge = await PublicKeyIndex.getChallenge();
  console.log('[PublicKeyUpload] Got challenge:', challenge.slice(0, 20) + '...');

  // 2. Sign the challenge with passkey
  const challengeHex = toHex(new TextEncoder().encode(challenge));
  console.log('[PublicKeyUpload] Signing challenge (hex):', challengeHex.slice(0, 20) + '...');
  const assertion = await Passkey.sign(challengeHex);
  console.log('[PublicKeyUpload] Signed. signatureHex length:', assertion.signatureHex.length);
  console.log('[PublicKeyUpload] authenticatorDataHex length:', assertion.authenticatorDataHex.length);
  console.log('[PublicKeyUpload] clientDataJSONHex length:', assertion.clientDataJSONHex.length);

  // 3. Convert DER signature to raw r‖s (64 bytes)
  const derBytes = fromHex(assertion.signatureHex);
  console.log('[PublicKeyUpload] DER sig bytes:', derBytes.length);
  const rawSig = derSignatureToRaw(derBytes);
  if (!rawSig) {
    console.error('[PublicKeyUpload] DER→raw conversion FAILED');
    throw new Error('Failed to convert DER signature to raw format');
  }
  console.log('[PublicKeyUpload] Raw sig (r||s):', toHex(rawSig).slice(0, 32) + '...');

  // 4. Prepare authenticatorData and clientDataJSON as base64url
  const authDataB64 = toBase64Url(fromHex(assertion.authenticatorDataHex));
  const clientDataB64 = toBase64Url(fromHex(assertion.clientDataJSONHex));

  // 5. Upload to server
  const request = {
    rpId: Passkey.RELYING_PARTY,
    credentialId,
    publicKey: publicKeyHex,
    challenge,
    signature: toHex(rawSig),
    authenticatorData: authDataB64,
    clientDataJSON: clientDataB64,
    name,
  };
  console.log('[PublicKeyUpload] Submitting to server:', JSON.stringify({
    rpId: request.rpId,
    credentialId: request.credentialId.slice(0, 16) + '...',
    publicKey: request.publicKey.slice(0, 16) + '...',
    challenge: request.challenge.slice(0, 16) + '...',
    signature: request.signature.slice(0, 16) + '...',
    authenticatorData: request.authenticatorData.slice(0, 16) + '...',
    clientDataJSON: request.clientDataJSON.slice(0, 16) + '...',
    name: request.name,
  }));

  await PublicKeyIndex.createRecord(request);
  console.log('[PublicKeyUpload] Upload SUCCESS for:', name);

  // 6. Remove from pending uploads
  await removePendingUpload(credentialId);
  console.log('[PublicKeyUpload] Removed from pending uploads');
}

/**
 * Retry all pending public key uploads.
 */
export async function retryPendingUploads(): Promise<{
  succeeded: number;
  failed: number;
}> {
  const pending = await loadPendingUploads();
  console.log('[PublicKeyUpload] Retrying', pending.length, 'pending uploads');

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
    } catch (err) {
      failed++;
      console.error('[PublicKeyUpload] Retry FAILED for', upload.name, ':', err instanceof Error ? err.message : String(err));
    }
  }

  console.log('[PublicKeyUpload] Retry complete:', succeeded, 'succeeded,', failed, 'failed');
  return { succeeded, failed };
}
