import Foundation
import React

/// Native module bridging iCloud Key-Value Store to React Native.
///
/// Uses `NSUbiquitousKeyValueStore` for cross-device sync of small data
/// (1 MB total, 1024 keys max — ideal for wallet metadata).
///
/// All values are stored as strings. The JS layer handles JSON
/// serialisation/deserialisation.
///
/// Error codes:
///   - CLOUD_NOT_SIGNED_IN   — user not signed into iCloud
///   - CLOUD_QUOTA_EXCEEDED  — 1 MB limit reached
///   - CLOUD_FAILED          — generic failure
@objc(VelaCloudSync)
class VelaCloudSyncModule: RCTEventEmitter {

    private let store = NSUbiquitousKeyValueStore.default

    private var hasListeners = false

    override init() {
        super.init()
        // Listen for external changes (pushed from another device)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleStoreChange(_:)),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: store
        )
        // Trigger initial sync
        store.synchronize()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - RCTEventEmitter

    @objc override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! {
        return [
            "VelaCloudSync_syncCompleted",
            "VelaCloudSync_syncFailed",
            "VelaCloudSync_dataChanged",
        ]
    }

    override func startObserving() { hasListeners = true }
    override func stopObserving()  { hasListeners = false }

    // MARK: - isSupported

    @objc func isSupported(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        // NSUbiquitousKeyValueStore is always present on iOS.
        // Actual availability depends on iCloud sign-in status.
        resolve(true)
    }

    // MARK: - getAvailability

    @objc func getAvailability(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        // Check iCloud sign-in by checking if the ubiquity identity token exists
        if FileManager.default.ubiquityIdentityToken != nil {
            resolve("available")
        } else {
            resolve("notSignedIn")
        }
    }

    // MARK: - save

    @objc func save(
        _ key: String,
        value: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        store.set(value, forKey: key)
        store.synchronize()
        resolve(nil)
    }

    // MARK: - get

    @objc func get(
        _ key: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let value = store.string(forKey: key)
        resolve(value)  // nil if key doesn't exist → JS receives null
    }

    // MARK: - remove

    @objc func remove(
        _ key: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        store.removeObject(forKey: key)
        store.synchronize()
        resolve(nil)
    }

    // MARK: - listKeys

    @objc func listKeys(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let keys = Array(store.dictionaryRepresentation.keys)
        resolve(keys)
    }

    // MARK: - syncNow

    @objc func syncNow(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let success = store.synchronize()
        if success {
            if hasListeners {
                sendEvent(withName: "VelaCloudSync_syncCompleted", body: [:])
            }
        }
        // synchronize() is best-effort — always resolve
        resolve(nil)
    }

    // MARK: - External Change Notification

    @objc private func handleStoreChange(_ notification: Notification) {
        guard hasListeners else { return }

        let userInfo = notification.userInfo
        let reason = userInfo?[NSUbiquitousKeyValueStoreChangeReasonKey] as? Int

        // Extract changed keys
        let changedKeys = userInfo?[NSUbiquitousKeyValueStoreChangedKeysKey] as? [String] ?? []

        switch reason {
        case NSUbiquitousKeyValueStoreServerChange,
             NSUbiquitousKeyValueStoreInitialSyncChange:
            // Data changed from another device or initial sync
            sendEvent(
                withName: "VelaCloudSync_dataChanged",
                body: ["changedKeys": changedKeys]
            )

        case NSUbiquitousKeyValueStoreQuotaViolationChange:
            sendEvent(
                withName: "VelaCloudSync_syncFailed",
                body: ["error": "Quota exceeded"]
            )

        case NSUbiquitousKeyValueStoreAccountChange:
            // iCloud account changed — re-read all data
            sendEvent(
                withName: "VelaCloudSync_dataChanged",
                body: ["changedKeys": changedKeys]
            )

        default:
            break
        }
    }
}
