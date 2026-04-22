package com.velawallet.passkey

import android.app.Activity
import android.util.Base64
import androidx.credentials.*
import androidx.credentials.exceptions.*
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.security.SecureRandom

/**
 * Native module bridging Android Passkeys (Credential Manager) to React Native.
 *
 * All binary data crosses the bridge as lowercase hex strings.
 *
 * Error codes:
 *   - PASSKEY_CANCELLED      — user dismissed the dialog
 *   - PASSKEY_FAILED         — generic failure
 *   - PASSKEY_NO_CREDENTIAL  — no credential matched
 *   - PASSKEY_NOT_SUPPORTED  — device does not support passkeys
 */
class VelaPasskeyModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "VelaPasskey"
        const val RELYING_PARTY = "getvela.app"
    }

    override fun getName(): String = NAME

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onCatalystInstanceDestroy() {
        scope.cancel()
    }

    // MARK: - isSupported

    @ReactMethod
    fun isSupported(promise: Promise) {
        // Credential Manager is available on Android 9+ with Google Play Services
        promise.resolve(true)
    }

    // MARK: - register

    @ReactMethod
    fun register(userName: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("PASSKEY_FAILED", "No activity available")
            return
        }

        scope.launch {
            try {
                val challenge = generateChallenge()
                val userId = encodeUserID(userName)
                val challengeB64 = base64UrlEncode(challenge)
                val userIdB64 = base64UrlEncode(userId)

                val json = """
                {
                    "rp": {"id": "$RELYING_PARTY", "name": "Vela Wallet"},
                    "user": {"id": "$userIdB64", "name": "$userName", "displayName": "$userName"},
                    "challenge": "$challengeB64",
                    "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
                    "authenticatorSelection": {
                        "authenticatorAttachment": "platform",
                        "residentKey": "required",
                        "userVerification": "required"
                    },
                    "attestation": "direct"
                }
                """.trimIndent()

                val request = CreatePublicKeyCredentialRequest(json)
                val credentialManager = CredentialManager.create(activity)
                val result = credentialManager.createCredential(activity, request)
                val response = result as CreatePublicKeyCredentialResponse

                val responseJson = JSONObject(response.registrationResponseJson)
                val responseObj = responseJson.getJSONObject("response")

                val rawId = base64UrlDecode(responseJson.getString("rawId"))
                val attestationObject = base64UrlDecode(
                    responseObj.getString("attestationObject")
                )
                val clientDataJSON = base64UrlDecode(
                    responseObj.getString("clientDataJSON")
                )

                val dict = Arguments.createMap().apply {
                    putString("credentialId", toHex(rawId))
                    putString("attestationObjectHex", toHex(attestationObject))
                    putString("clientDataJSONHex", toHex(clientDataJSON))
                }
                promise.resolve(dict)

            } catch (e: CreateCredentialCancellationException) {
                promise.reject("PASSKEY_CANCELLED", "User cancelled registration", e)
            } catch (e: CreateCredentialException) {
                promise.reject("PASSKEY_FAILED", e.message ?: "Registration failed", e)
            } catch (e: Exception) {
                promise.reject("PASSKEY_FAILED", e.message ?: "Unknown error", e)
            }
        }
    }

    // MARK: - authenticate

    @ReactMethod
    fun authenticate(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("PASSKEY_FAILED", "No activity available")
            return
        }

        scope.launch {
            try {
                val challenge = generateChallenge()
                val challengeB64 = base64UrlEncode(challenge)

                val json = """
                {
                    "challenge": "$challengeB64",
                    "rpId": "$RELYING_PARTY",
                    "userVerification": "required"
                }
                """.trimIndent()

                val request = GetCredentialRequest(
                    listOf(GetPublicKeyCredentialOption(json))
                )
                val credentialManager = CredentialManager.create(activity)
                val result = credentialManager.getCredential(activity, request)

                resolveAssertion(result, promise)

            } catch (e: GetCredentialCancellationException) {
                promise.reject("PASSKEY_CANCELLED", "User cancelled authentication", e)
            } catch (e: NoCredentialException) {
                promise.reject("PASSKEY_NO_CREDENTIAL", "No passkey found for this app", e)
            } catch (e: GetCredentialException) {
                promise.reject("PASSKEY_FAILED", e.message ?: "Authentication failed", e)
            } catch (e: Exception) {
                promise.reject("PASSKEY_FAILED", e.message ?: "Unknown error", e)
            }
        }
    }

    // MARK: - sign

    @ReactMethod
    fun sign(challengeHex: String, credentialId: String?, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("PASSKEY_FAILED", "No activity available")
            return
        }

        scope.launch {
            try {
                val challengeBytes = fromHex(challengeHex)
                val challengeB64 = base64UrlEncode(challengeBytes)

                // Build the assertion request
                // Note: Android Credential Manager does not support allowCredentials
                // for filtering to a specific credential (unlike iOS).
                // The OS will show the picker if multiple credentials exist.
                val json = """
                {
                    "challenge": "$challengeB64",
                    "rpId": "$RELYING_PARTY",
                    "userVerification": "required"
                }
                """.trimIndent()

                val request = GetCredentialRequest(
                    listOf(GetPublicKeyCredentialOption(json))
                )
                val credentialManager = CredentialManager.create(activity)
                val result = credentialManager.getCredential(activity, request)

                resolveAssertion(result, promise)

            } catch (e: GetCredentialCancellationException) {
                promise.reject("PASSKEY_CANCELLED", "User cancelled signing", e)
            } catch (e: NoCredentialException) {
                promise.reject("PASSKEY_NO_CREDENTIAL", "No passkey found", e)
            } catch (e: GetCredentialException) {
                promise.reject("PASSKEY_FAILED", e.message ?: "Signing failed", e)
            } catch (e: Exception) {
                promise.reject("PASSKEY_FAILED", e.message ?: "Unknown error", e)
            }
        }
    }

    // MARK: - Helpers

    private fun resolveAssertion(result: GetCredentialResponse, promise: Promise) {
        val credential = result.credential as? PublicKeyCredential
        if (credential == null) {
            promise.reject("PASSKEY_NO_CREDENTIAL", "No public key credential returned")
            return
        }

        val responseJson = JSONObject(credential.authenticationResponseJson)
        val responseObj = responseJson.getJSONObject("response")

        val rawId = base64UrlDecode(responseJson.getString("rawId"))
        val authenticatorData = base64UrlDecode(
            responseObj.getString("authenticatorData")
        )
        val signature = base64UrlDecode(responseObj.getString("signature"))
        val clientDataJSON = base64UrlDecode(
            responseObj.getString("clientDataJSON")
        )

        val dict = Arguments.createMap().apply {
            putString("credentialId", toHex(rawId))
            putString("signatureHex", toHex(signature))
            putString("authenticatorDataHex", toHex(authenticatorData))
            putString("clientDataJSONHex", toHex(clientDataJSON))
        }

        if (responseObj.has("userHandle")) {
            val userHandle = base64UrlDecode(responseObj.getString("userHandle"))
            if (userHandle.isNotEmpty()) {
                dict.putString("userIdHex", toHex(userHandle))
            }
        }

        promise.resolve(dict)
    }

    private fun encodeUserID(name: String): ByteArray {
        val combined = "$name\u0000${java.util.UUID.randomUUID()}"
        return combined.toByteArray(Charsets.UTF_8)
    }

    private fun generateChallenge(): ByteArray {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return bytes
    }

    // MARK: - Encoding helpers

    private fun base64UrlEncode(data: ByteArray): String =
        Base64.encodeToString(data, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun base64UrlDecode(str: String): ByteArray =
        Base64.decode(str, Base64.URL_SAFE or Base64.NO_PADDING)

    private fun toHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    private fun fromHex(hex: String): ByteArray {
        val clean = if (hex.startsWith("0x")) hex.substring(2) else hex
        return ByteArray(clean.length / 2) { i ->
            clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }
}
