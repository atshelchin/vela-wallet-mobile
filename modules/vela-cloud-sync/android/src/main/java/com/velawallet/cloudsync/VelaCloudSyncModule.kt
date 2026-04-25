package com.velawallet.cloudsync

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Cloud sync using SharedPreferences with Android Auto Backup.
 * No external dependencies — relies on android:allowBackup="true".
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

    @ReactMethod
    fun isSupported(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun getAvailability(promise: Promise) {
        promise.resolve("available")
    }

    @ReactMethod
    fun save(key: String, value: String, promise: Promise) {
        try {
            prefs.edit().putString(key, value).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLOUD_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun get(key: String, promise: Promise) {
        try {
            promise.resolve(prefs.getString(key, null))
        } catch (e: Exception) {
            promise.reject("CLOUD_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun remove(key: String, promise: Promise) {
        try {
            prefs.edit().remove(key).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLOUD_FAILED", e.message, e)
        }
    }

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

    @ReactMethod
    fun syncNow(promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
