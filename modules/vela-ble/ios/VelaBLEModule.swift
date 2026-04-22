import Foundation
import CoreBluetooth
import React

@objc(VelaBLE)
class VelaBLEModule: RCTEventEmitter, CBPeripheralManagerDelegate {

    // BLE UUIDs (must match Chrome extension)
    static let serviceUUID = CBUUID(string: "0000BE1A-0000-1000-8000-00805F9B34FB")
    static let requestCharUUID = CBUUID(string: "0001BE1A-0000-1000-8000-00805F9B34FB")
    static let responseCharUUID = CBUUID(string: "0002BE1A-0000-1000-8000-00805F9B34FB")
    static let walletInfoCharUUID = CBUUID(string: "0003BE1A-0000-1000-8000-00805F9B34FB")

    private var peripheralManager: CBPeripheralManager!
    private var requestChar: CBMutableCharacteristic!
    private var responseChar: CBMutableCharacteristic!
    private var walletInfoChar: CBMutableCharacteristic!
    private var service: CBMutableService!
    private var subscribedCentral: CBCentral?

    private var advConfig: [String: Any] = [:]
    private var shouldAutoRestart = false
    private var incomingBuffer = Data()

    // Serialized outgoing queue
    private var outgoingQueue: [Data] = []
    private var currentChunks: [Data] = []
    private var currentChunkIndex = 0
    private var isSending = false

    override init() {
        super.init()
        peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
    }

    // MARK: - RCTEventEmitter

    override func supportedEvents() -> [String]! {
        return [
            "VelaBLE_stateChange",
            "VelaBLE_advertisingStarted",
            "VelaBLE_advertisingStopped",
            "VelaBLE_centralConnected",
            "VelaBLE_centralDisconnected",
            "VelaBLE_requestReceived",
            "VelaBLE_error"
        ]
    }

    override static func requiresMainQueueSetup() -> Bool { true }

    // MARK: - Exported Methods

    @objc func isSupported(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(true) // iOS always supports BLE peripheral
    }

    @objc func getState(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolve(stateString(peripheralManager.state))
    }

    @objc func requestPermissions(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        // iOS permissions are handled by Info.plist entries
        resolve(peripheralManager.state == .poweredOn)
    }

    @objc func startAdvertising(_ config: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        // config: { walletAddress, accountName, chainId, accounts: [{name, address}] }
        advConfig = config as? [String: Any] ?? [:]
        shouldAutoRestart = true

        guard peripheralManager.state == .poweredOn else {
            resolve(nil) // will start when powered on
            return
        }

        setupAndAdvertise()
        resolve(nil)
    }

    @objc func stopAdvertising(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shouldAutoRestart = false
        peripheralManager.stopAdvertising()
        peripheralManager.removeAllServices()
        subscribedCentral = nil
        outgoingQueue.removeAll()
        isSending = false
        sendEvent(withName: "VelaBLE_advertisingStopped", body: [:])
        resolve(nil)
    }

    @objc func updateWalletInfo(_ config: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        advConfig = config as? [String: Any] ?? [:]
        if let data = try? JSONSerialization.data(withJSONObject: advConfig) {
            walletInfoChar?.value = data
        }
        // Push update via response channel
        let response: [String: Any] = ["id": "wallet_info_update", "result": advConfig]
        sendResponseData(response)
        resolve(nil)
    }

    @objc func sendResponse(_ id: String, result: Any?, error: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        var response: [String: Any] = ["id": id]
        if let result = result { response["result"] = result }
        if let error = error { response["error"] = error }
        sendResponseData(response)
        resolve(nil)
    }

    // MARK: - Private

    private func setupAndAdvertise() {
        if peripheralManager.isAdvertising {
            peripheralManager.stopAdvertising()
            peripheralManager.removeAllServices()
        }

        requestChar = CBMutableCharacteristic(
            type: Self.requestCharUUID,
            properties: [.write, .writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )

        responseChar = CBMutableCharacteristic(
            type: Self.responseCharUUID,
            properties: [.notify],
            value: nil,
            permissions: [.readable]
        )

        walletInfoChar = CBMutableCharacteristic(
            type: Self.walletInfoCharUUID,
            properties: [.read],
            value: nil,
            permissions: [.readable]
        )

        if let data = try? JSONSerialization.data(withJSONObject: advConfig) {
            walletInfoChar.value = data
        }

        service = CBMutableService(type: Self.serviceUUID, primary: true)
        service.characteristics = [requestChar, responseChar, walletInfoChar]
        peripheralManager.add(service)

        peripheralManager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [Self.serviceUUID],
            CBAdvertisementDataLocalNameKey: "Vela Wallet",
        ])

        sendEvent(withName: "VelaBLE_advertisingStarted", body: [:])
    }

    private func sendResponseData(_ response: [String: Any]) {
        guard subscribedCentral != nil else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: response) else { return }

        let fullData = data + Data("\n\n".utf8)
        outgoingQueue.append(fullData)
        if !isSending { sendNextMessage() }
    }

    private func sendNextMessage() {
        guard let central = subscribedCentral else {
            outgoingQueue.removeAll()
            isSending = false
            return
        }

        if currentChunkIndex >= currentChunks.count {
            if outgoingQueue.isEmpty {
                isSending = false
                return
            }
            let fullData = outgoingQueue.removeFirst()
            let mtu = central.maximumUpdateValueLength
            currentChunks = stride(from: 0, to: fullData.count, by: mtu).map {
                Data(fullData[$0..<min($0 + mtu, fullData.count)])
            }
            currentChunkIndex = 0
            isSending = true
        }

        while currentChunkIndex < currentChunks.count {
            let chunk = currentChunks[currentChunkIndex]
            let sent = peripheralManager.updateValue(chunk, for: responseChar, onSubscribedCentrals: [central])
            if sent { currentChunkIndex += 1 } else { return }
        }

        sendNextMessage()
    }

    private func handleIncomingData(_ data: Data) {
        incomingBuffer.append(data)

        guard let request = try? JSONSerialization.jsonObject(with: incomingBuffer) as? [String: Any] else { return }
        incomingBuffer = Data()

        let method = request["method"] as? String ?? ""
        let id = request["id"] as? String ?? ""

        // Handle internal methods
        if method == "wallet_switchAccount", let address = (request["params"] as? [Any])?.first as? String {
            sendResponseData(["id": id, "result": true])
            // Emit as event so JS can handle account switch
            sendEvent(withName: "VelaBLE_requestReceived", body: request)
            return
        }

        if method == "wallet_switchEthereumChain" {
            sendResponseData(["id": id, "result": NSNull()])
            sendEvent(withName: "VelaBLE_requestReceived", body: request)
            return
        }

        sendEvent(withName: "VelaBLE_requestReceived", body: request)
    }

    private func stateString(_ state: CBManagerState) -> String {
        switch state {
        case .unknown: return "unknown"
        case .resetting: return "resetting"
        case .unsupported: return "unsupported"
        case .unauthorized: return "unauthorized"
        case .poweredOff: return "poweredOff"
        case .poweredOn: return "poweredOn"
        @unknown default: return "unknown"
        }
    }

    // MARK: - CBPeripheralManagerDelegate

    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        sendNextMessage()
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        sendEvent(withName: "VelaBLE_stateChange", body: ["state": stateString(peripheral.state)])
        if peripheral.state == .poweredOn && shouldAutoRestart {
            setupAndAdvertise()
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        if characteristic.uuid == Self.responseCharUUID {
            subscribedCentral = central
            sendEvent(withName: "VelaBLE_centralConnected", body: ["centralId": central.identifier.uuidString])
            // Push wallet info
            sendResponseData(["id": "wallet_info_update", "result": advConfig])
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        if characteristic.uuid == Self.responseCharUUID {
            subscribedCentral = nil
            sendEvent(withName: "VelaBLE_centralDisconnected", body: ["centralId": central.identifier.uuidString])
            if shouldAutoRestart {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                    guard let self, self.shouldAutoRestart, self.subscribedCentral == nil else { return }
                    self.setupAndAdvertise()
                }
            }
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == Self.requestCharUUID, let data = request.value {
                peripheral.respond(to: request, withResult: .success)
                handleIncomingData(data)
            } else {
                peripheral.respond(to: request, withResult: .requestNotSupported)
            }
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        if request.characteristic.uuid == Self.walletInfoCharUUID {
            guard let value = walletInfoChar.value else {
                peripheral.respond(to: request, withResult: .attributeNotFound)
                return
            }
            guard request.offset <= value.count else {
                peripheral.respond(to: request, withResult: .invalidOffset)
                return
            }
            request.value = value.subdata(in: request.offset..<value.count)
            peripheral.respond(to: request, withResult: .success)
        } else {
            peripheral.respond(to: request, withResult: .requestNotSupported)
        }
    }
}
