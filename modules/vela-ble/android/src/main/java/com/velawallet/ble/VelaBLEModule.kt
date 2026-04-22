package com.velawallet.ble

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.*

class VelaBLEModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "VelaBLE"

        val SERVICE_UUID: UUID = UUID.fromString("0000BE1A-0000-1000-8000-00805F9B34FB")
        val REQUEST_CHAR_UUID: UUID = UUID.fromString("0001BE1A-0000-1000-8000-00805F9B34FB")
        val RESPONSE_CHAR_UUID: UUID = UUID.fromString("0002BE1A-0000-1000-8000-00805F9B34FB")
        val WALLET_INFO_CHAR_UUID: UUID = UUID.fromString("0003BE1A-0000-1000-8000-00805F9B34FB")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB")
    }

    override fun getName() = NAME

    private var bluetoothManager: BluetoothManager? = null
    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var subscribedDevice: BluetoothDevice? = null
    private var advConfig: JSONObject = JSONObject()
    private var shouldAutoRestart = false
    private var incomingBuffer = ByteArray(0)

    // Serialized outgoing queue
    private val outgoingQueue: MutableList<ByteArray> = mutableListOf()
    private var currentChunks: List<ByteArray> = emptyList()
    private var currentChunkIndex = 0
    private var isSending = false
    private var negotiatedMtu = 23 // default BLE MTU

    private var responseChar: BluetoothGattCharacteristic? = null
    private var walletInfoChar: BluetoothGattCharacteristic? = null

    init {
        bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    }

    // -------------------------------------------------------------------------
    // Event emission
    // -------------------------------------------------------------------------

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // -------------------------------------------------------------------------
    // Exported Methods
    // -------------------------------------------------------------------------

    @ReactMethod
    fun isSupported(promise: Promise) {
        val adapter = bluetoothManager?.adapter
        promise.resolve(adapter?.isMultipleAdvertisementSupported == true)
    }

    @ReactMethod
    fun getState(promise: Promise) {
        val adapter = bluetoothManager?.adapter
        promise.resolve(
            when {
                adapter == null -> "unsupported"
                !adapter.isEnabled -> "poweredOff"
                else -> "poweredOn"
            }
        )
    }

    @ReactMethod
    fun requestPermissions(promise: Promise) {
        // Android runtime permissions are handled at the app level via manifest / PermissionsAndroid
        val adapter = bluetoothManager?.adapter
        promise.resolve(adapter?.isEnabled == true)
    }

    @ReactMethod
    fun startAdvertising(config: ReadableMap, promise: Promise) {
        advConfig = readableMapToJSON(config)
        shouldAutoRestart = true

        val adapter = bluetoothManager?.adapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLE_NOT_AVAILABLE", "Bluetooth is not available or not enabled")
            return
        }

        setupAndAdvertise()
        promise.resolve(null)
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        shouldAutoRestart = false
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            gattServer?.close()
        } catch (_: SecurityException) {
            // Permission not granted – best effort
        }
        gattServer = null
        subscribedDevice = null
        outgoingQueue.clear()
        isSending = false

        val params = Arguments.createMap()
        sendEvent("VelaBLE_advertisingStopped", params)
        promise.resolve(null)
    }

    @ReactMethod
    fun updateWalletInfo(config: ReadableMap, promise: Promise) {
        advConfig = readableMapToJSON(config)
        // Update the cached characteristic value
        walletInfoChar?.value = advConfig.toString().toByteArray(Charsets.UTF_8)
        // Push update via the response (notify) channel
        val response = JSONObject()
        response.put("id", "wallet_info_update")
        response.put("result", advConfig)
        sendResponseData(response)
        promise.resolve(null)
    }

    @ReactMethod
    fun sendResponse(id: String, result: Dynamic?, error: ReadableMap?, promise: Promise) {
        val response = JSONObject()
        response.put("id", id)
        if (result != null && result.type != ReadableType.Null) {
            response.put("result", dynamicToAny(result))
        }
        if (error != null) {
            response.put("error", readableMapToJSON(error))
        }
        sendResponseData(response)
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // Required for RN NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
        // Required for RN NativeEventEmitter
    }

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    private fun setupAndAdvertise() {
        try {
            val adapter = bluetoothManager?.adapter ?: return
            advertiser = adapter.bluetoothLeAdvertiser ?: return

            // Tear down any previous server
            gattServer?.close()

            // Open GATT server
            gattServer = bluetoothManager?.openGattServer(reactApplicationContext, gattCallback)

            val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

            // Request characteristic (central writes here)
            val requestCharacteristic = BluetoothGattCharacteristic(
                REQUEST_CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )

            // Response characteristic (peripheral notifies here)
            responseChar = BluetoothGattCharacteristic(
                RESPONSE_CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
            val cccd = BluetoothGattDescriptor(
                CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
            responseChar!!.addDescriptor(cccd)

            // Wallet info characteristic (central reads here)
            walletInfoChar = BluetoothGattCharacteristic(
                WALLET_INFO_CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
            walletInfoChar!!.value = advConfig.toString().toByteArray(Charsets.UTF_8)

            service.addCharacteristic(requestCharacteristic)
            service.addCharacteristic(responseChar)
            service.addCharacteristic(walletInfoChar)

            gattServer?.addService(service)

            // Build advertising data
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .build()

            val data = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(ParcelUuid(SERVICE_UUID))
                .build()

            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build()

            advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
        } catch (_: SecurityException) {
            val params = Arguments.createMap().apply {
                putString("code", "PERMISSION_DENIED")
                putString("message", "Bluetooth permission not granted")
            }
            sendEvent("VelaBLE_error", params)
        }
    }

    // -------------------------------------------------------------------------
    // AdvertiseCallback
    // -------------------------------------------------------------------------

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            val params = Arguments.createMap()
            sendEvent("VelaBLE_advertisingStarted", params)
        }

        override fun onStartFailure(errorCode: Int) {
            val params = Arguments.createMap().apply {
                putString("code", "ADVERTISE_FAILED")
                putString("message", "Advertising failed with error code: $errorCode")
            }
            sendEvent("VelaBLE_error", params)
        }
    }

    // -------------------------------------------------------------------------
    // BluetoothGattServerCallback
    // -------------------------------------------------------------------------

    private val gattCallback = object : BluetoothGattServerCallback() {

        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                // Connection established – subscription is tracked via CCCD write
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (subscribedDevice != null && device.address == subscribedDevice?.address) {
                    subscribedDevice = null
                    outgoingQueue.clear()
                    isSending = false

                    val params = Arguments.createMap().apply {
                        putString("centralId", device.address)
                    }
                    sendEvent("VelaBLE_centralDisconnected", params)

                    // Auto-reconnect: restart advertising after a short delay
                    if (shouldAutoRestart) {
                        android.os.Handler(reactApplicationContext.mainLooper).postDelayed({
                            if (shouldAutoRestart && subscribedDevice == null) {
                                setupAndAdvertise()
                            }
                        }, 1000)
                    }
                }
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (characteristic.uuid == REQUEST_CHAR_UUID && value != null) {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
                handleIncomingData(value)
            } else {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null)
                }
            }
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (characteristic.uuid == WALLET_INFO_CHAR_UUID) {
                val value = walletInfoChar?.value ?: ByteArray(0)
                if (offset > value.size) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, 0, null)
                } else {
                    val responseValue = value.copyOfRange(offset, value.size)
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, responseValue)
                }
            } else {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null)
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (descriptor.uuid == CCCD_UUID) {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }

                val isSubscribing = value != null &&
                    value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)

                if (isSubscribing) {
                    subscribedDevice = device
                    val params = Arguments.createMap().apply {
                        putString("centralId", device.address)
                    }
                    sendEvent("VelaBLE_centralConnected", params)

                    // Push wallet info on subscription (mirrors iOS behaviour)
                    val response = JSONObject()
                    response.put("id", "wallet_info_update")
                    response.put("result", advConfig)
                    sendResponseData(response)
                } else {
                    // Unsubscribed
                    if (subscribedDevice?.address == device.address) {
                        subscribedDevice = null
                        outgoingQueue.clear()
                        isSending = false

                        val params = Arguments.createMap().apply {
                            putString("centralId", device.address)
                        }
                        sendEvent("VelaBLE_centralDisconnected", params)

                        if (shouldAutoRestart) {
                            android.os.Handler(reactApplicationContext.mainLooper).postDelayed({
                                if (shouldAutoRestart && subscribedDevice == null) {
                                    setupAndAdvertise()
                                }
                            }, 1000)
                        }
                    }
                }
            } else {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null)
                }
            }
        }

        override fun onDescriptorReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            descriptor: BluetoothGattDescriptor
        ) {
            if (descriptor.uuid == CCCD_UUID) {
                val value = if (subscribedDevice?.address == device.address) {
                    BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                } else {
                    BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
                }
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            } else {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null)
            }
        }

        override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
            negotiatedMtu = mtu
        }

        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                sendNextChunk()
            }
        }
    }

    // -------------------------------------------------------------------------
    // Chunked send protocol (mirrors iOS implementation)
    // -------------------------------------------------------------------------

    private fun sendResponseData(response: JSONObject) {
        if (subscribedDevice == null) return

        val jsonBytes = response.toString().toByteArray(Charsets.UTF_8)
        // Append "\n\n" delimiter so the receiver knows the message is complete
        val fullData = jsonBytes + "\n\n".toByteArray(Charsets.UTF_8)
        outgoingQueue.add(fullData)
        if (!isSending) {
            sendNextMessage()
        }
    }

    private fun sendNextMessage() {
        if (subscribedDevice == null) {
            outgoingQueue.clear()
            isSending = false
            return
        }

        if (currentChunkIndex >= currentChunks.size) {
            if (outgoingQueue.isEmpty()) {
                isSending = false
                return
            }
            val fullData = outgoingQueue.removeAt(0)
            // MTU includes 3 bytes of ATT header, so usable payload is mtu - 3
            val chunkSize = maxOf(negotiatedMtu - 3, 20)
            currentChunks = fullData.toList().chunked(chunkSize) { it.toByteArray() }
            currentChunkIndex = 0
            isSending = true
        }

        sendNextChunk()
    }

    private fun sendNextChunk() {
        val device = subscribedDevice ?: run {
            outgoingQueue.clear()
            isSending = false
            return
        }
        val char = responseChar ?: return

        if (currentChunkIndex >= currentChunks.size) {
            // Current message fully sent – move to next queued message
            sendNextMessage()
            return
        }

        val chunk = currentChunks[currentChunkIndex]
        currentChunkIndex++

        char.value = chunk
        try {
            val sent = gattServer?.notifyCharacteristicChanged(device, char, false) ?: false
            if (!sent) {
                // Notification queue full – back off and retry
                currentChunkIndex--
                android.os.Handler(reactApplicationContext.mainLooper).postDelayed({
                    sendNextChunk()
                }, 50)
            }
            // If sent, onNotificationSent callback will trigger next chunk
        } catch (_: SecurityException) {
            // Permission revoked mid-send
            isSending = false
        }
    }

    // -------------------------------------------------------------------------
    // Incoming data handling
    // -------------------------------------------------------------------------

    private fun handleIncomingData(data: ByteArray) {
        incomingBuffer = incomingBuffer + data

        // Attempt to parse the accumulated buffer as JSON
        val json = try {
            String(incomingBuffer, Charsets.UTF_8)
        } catch (_: Exception) {
            return
        }

        val request: JSONObject = try {
            JSONObject(json)
        } catch (_: Exception) {
            // Not a complete JSON object yet – wait for more data
            return
        }

        // Successfully parsed – clear buffer
        incomingBuffer = ByteArray(0)

        val method = request.optString("method", "")
        val id = request.optString("id", "")

        // Handle internal methods
        if (method == "wallet_switchAccount") {
            val params = request.optJSONArray("params")
            if (params != null && params.length() > 0) {
                val resp = JSONObject()
                resp.put("id", id)
                resp.put("result", true)
                sendResponseData(resp)
            }
            sendEvent("VelaBLE_requestReceived", jsonObjectToWritableMap(request))
            return
        }

        if (method == "wallet_switchEthereumChain") {
            val resp = JSONObject()
            resp.put("id", id)
            resp.put("result", JSONObject.NULL)
            sendResponseData(resp)
            sendEvent("VelaBLE_requestReceived", jsonObjectToWritableMap(request))
            return
        }

        sendEvent("VelaBLE_requestReceived", jsonObjectToWritableMap(request))
    }

    // -------------------------------------------------------------------------
    // Conversion helpers
    // -------------------------------------------------------------------------

    private fun readableMapToJSON(map: ReadableMap): JSONObject {
        val json = JSONObject()
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            when (map.getType(key)) {
                ReadableType.Null -> json.put(key, JSONObject.NULL)
                ReadableType.Boolean -> json.put(key, map.getBoolean(key))
                ReadableType.Number -> json.put(key, map.getDouble(key))
                ReadableType.String -> json.put(key, map.getString(key))
                ReadableType.Map -> json.put(key, readableMapToJSON(map.getMap(key)!!))
                ReadableType.Array -> json.put(key, readableArrayToJSON(map.getArray(key)!!))
            }
        }
        return json
    }

    private fun readableArrayToJSON(array: ReadableArray): JSONArray {
        val json = JSONArray()
        for (i in 0 until array.size()) {
            when (array.getType(i)) {
                ReadableType.Null -> json.put(JSONObject.NULL)
                ReadableType.Boolean -> json.put(array.getBoolean(i))
                ReadableType.Number -> json.put(array.getDouble(i))
                ReadableType.String -> json.put(array.getString(i))
                ReadableType.Map -> json.put(readableMapToJSON(array.getMap(i)))
                ReadableType.Array -> json.put(readableArrayToJSON(array.getArray(i)))
            }
        }
        return json
    }

    private fun dynamicToAny(dynamic: Dynamic): Any? {
        return when (dynamic.type) {
            ReadableType.Null -> JSONObject.NULL
            ReadableType.Boolean -> dynamic.asBoolean()
            ReadableType.Number -> dynamic.asDouble()
            ReadableType.String -> dynamic.asString()
            ReadableType.Map -> readableMapToJSON(dynamic.asMap())
            ReadableType.Array -> readableArrayToJSON(dynamic.asArray())
        }
    }

    private fun jsonObjectToWritableMap(json: JSONObject): WritableMap {
        val map = Arguments.createMap()
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val value = json.get(key)) {
                is Boolean -> map.putBoolean(key, value)
                is Int -> map.putInt(key, value)
                is Long -> map.putDouble(key, value.toDouble())
                is Double -> map.putDouble(key, value)
                is String -> map.putString(key, value)
                is JSONObject -> map.putMap(key, jsonObjectToWritableMap(value))
                is JSONArray -> map.putArray(key, jsonArrayToWritableArray(value))
                JSONObject.NULL -> map.putNull(key)
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    private fun jsonArrayToWritableArray(json: JSONArray): WritableArray {
        val array = Arguments.createArray()
        for (i in 0 until json.length()) {
            when (val value = json.get(i)) {
                is Boolean -> array.pushBoolean(value)
                is Int -> array.pushInt(value)
                is Long -> array.pushDouble(value.toDouble())
                is Double -> array.pushDouble(value)
                is String -> array.pushString(value)
                is JSONObject -> array.pushMap(jsonObjectToWritableMap(value))
                is JSONArray -> array.pushArray(jsonArrayToWritableArray(value))
                JSONObject.NULL -> array.pushNull()
                else -> array.pushString(value.toString())
            }
        }
        return array
    }
}
