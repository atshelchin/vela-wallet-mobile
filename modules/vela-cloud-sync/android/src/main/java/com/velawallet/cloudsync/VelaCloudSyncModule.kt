package com.velawallet.cloudsync

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.auth.blockstore.Blockstore
import com.google.android.gms.auth.blockstore.StoreBytesData
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest
import com.google.android.gms.auth.blockstore.DeleteBytesRequest
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.ConnectionResult

/**
 * Native module bridging Android cloud backup to React Native.
 *
 * Primary backend: Google Block Store API (end-to-end encrypted, backed up
 * to Google's servers, restored on new device sign-in).
 *
 * Fallback: SharedPreferences with `allowBackup=true` in the manifest,
 * which participates in Android Auto Backup.
 *
 * All values are stored as strings. The JS layer handles JSON
 * serialisation/deserialisation.
 *
 * Error codes:
 *   - CLOUD_NOT_SIGNED_IN   — no Google account on device
 *   - CLOUD_QUOTA_EXCEEDED  — Block Store 16 MB limit
 *   - CLOUD_FAILED          — generic failure
 */
class VelaCloudSyncModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "VelaCloudSync"
        private const val PREFS_NAME = "vela_cloud_sync"
    }

    override fun getName(): String = NAME

    private val prefs: SharedPreferences by lazy {
        reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private fun hasPlayServices(): Boolean {
        val result = GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(reactApplicationContext)
        return result == ConnectionResult.SUCCESS
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // MARK: - isSupported

    @ReactMethod
    fun isSupported(promise: Promise) {
        promise.resolve(true) // SharedPreferences backup always works
    }

    // MARK: - getAvailability

    @ReactMethod
    fun getAvailability(promise: Promise) {
        if (hasPlayServices()) {
            promise.resolve("available")
        } else {
            // Without Play Services, we still have SharedPreferences backup
            // but Block Store won't work. Report available since backup works.
            promise.resolve("available")
        }
    }

    // MARK: - save

    @ReactMethod
    fun save(key: String, value: String, promise: Promise) {
        try {
            // Always save to SharedPreferences (participates in Auto Backup)
            prefs.edit().putString(key, value).apply()

            // Also save to Block Store if available
            if (hasPlayServices()) {
                val data = StoreBytesData.Builder()
                    .setKey(key)
                    .setBytes(value.toByteArray(Charsets.UTF_8))
                    .setShouldBackupToCloud(true)
                    .build()

                val activity = currentActivity
                if (activity != null) {
                    Blockstore.getClient(activity)
                        .storeBytes(data)
                        .addOnSuccessListener { /* synced */ }
                        .addOnFailureListener { /* fallback to prefs only */ }
                }
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLOUD_FAILED", e.message, e)
        }
    }

    // MARK: - get

    @ReactMethod
    fun get(key: String, promise: Promise) {
        try {
            // Read from SharedPreferences first (fastest)
            val localValue = prefs.getString(key, null)
            if (localValue != null) {
                promise.resolve(localValue)
                return
            }

            // Try Block Store if Play Services available
            if (hasPlayServices()) {
                val activity = currentActivity
                if (activity != null) {
                    val request = RetrieveBytesRequest.Builder()
                        .setKeys(listOf(key))
                        .build()

                    Blockstore.getClient(activity)
                        .retrieveBytes(request)
                        .addOnSuccessListener { result ->
                            val blockData = result.blockstoreDataMap[key]
                            if (blockData != null) {
                                val value = String(blockData.bytes, Charsets.UTF_8)
                                // Cache locally
                                prefs.edit().putString(key, value).apply()
                                promise.resolve(value)
                            } else {
                                promise.resolve(null)
                            }
                        }
                        .addOnFailureListener {
                            // Block Store failed — return null (key not found)
                            promise.resolve(null)
                        }
                    return
                }
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLOUD_FAILED", e.message, e)
        }
    }

    // MARK: - remove

    @ReactMethod
    fun remove(key: String, promise: Promise) {
        try {
            prefs.edit().remove(key).apply()

            // Also remove from Block Store
            if (hasPlayServices()) {
                val activity = currentActivity
                if (activity != null) {
                    val request = DeleteBytesRequest.Builder()
                        .setKeys(listOf(key))
                        .build()

                    Blockstore.getClient(activity)
                        .deleteBytes(request)
                        .addOnSuccessListener { /* deleted */ }
                        .addOnFailureListener { /* ignore */ }
                }
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLOUD_FAILED", e.message, e)
        }
    }

    // MARK: - listKeys

    @ReactMethod
    fun listKeys(promise: Promise) {
        try {
            val keys = Arguments.createArray()
            prefs.all.keys.forEach { keys.pushString(it) }
            promise.resolve(keys)
        } catch (e: Exception) {
            promise.reject("CLOUD_FAILED", e.message, e)
        }
    }

    // MARK: - syncNow

    @ReactMethod
    fun syncNow(promise: Promise) {
        // On Android, sync is handled by the system automatically.
        // We can trigger a Block Store backup attempt.
        if (hasPlayServices()) {
            val activity = currentActivity
            if (activity != null) {
                // Re-save all prefs to Block Store to force sync
                val allData = prefs.all
                for ((key, value) in allData) {
                    if (value is String) {
                        val data = StoreBytesData.Builder()
                            .setKey(key)
                            .setBytes(value.toByteArray(Charsets.UTF_8))
                            .setShouldBackupToCloud(true)
                            .build()

                        Blockstore.getClient(activity)
                            .storeBytes(data)
                            .addOnFailureListener { /* best effort */ }
                    }
                }
            }
        }

        val params = Arguments.createMap()
        sendEvent("VelaCloudSync_syncCompleted", params)
        promise.resolve(null)
    }

    // MARK: - Event emitter support

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
