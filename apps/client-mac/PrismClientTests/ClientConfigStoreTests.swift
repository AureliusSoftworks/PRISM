import XCTest
@testable import PrismClient

final class ClientConfigStoreTests: XCTestCase {
    func testSaveLoadAndClearPairedServer() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = ClientConfigStore(applicationSupportDirectory: directory)
        let server = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            token: "session-token",
            clientAccessToken: "client-access-token",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        try store.save(server)
        XCTAssertEqual(store.loadPairedServer(), server)

        try store.clearPairedServer()
        XCTAssertNil(store.loadPairedServer())
    }

    func testMapsDefaultApiPortToWebAppURL() throws {
        let server = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            token: "session-token",
            clientAccessToken: "client-access-token",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        XCTAssertEqual(server.webAppURL?.absoluteString, "http://127.0.0.1:18788/")
    }

    func testMapsLegacyApiPortToLegacyWebAppURL() throws {
        let server = PairedServer(
            serverURL: "http://127.0.0.1:8787",
            token: "session-token",
            clientAccessToken: "client-access-token",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        XCTAssertEqual(server.webAppURL?.absoluteString, "http://127.0.0.1:3000/")
    }

    @MainActor
    func testAppModelClearsStoredPairingWithoutClientAccessToken() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = ClientConfigStore(applicationSupportDirectory: directory)
        let staleServer = PairedServer(
            serverURL: "http://127.0.0.1:8787",
            token: "session-token",
            clientAccessToken: nil,
            expiresAt: Date(timeIntervalSinceNow: 3_600),
            displayName: "Prism Owner"
        )

        try store.save(staleServer)
        let model = AppModel(configStore: store)

        XCTAssertNil(model.pairedServer)
        XCTAssertNil(store.loadPairedServer())
        XCTAssertEqual(model.statusMessage, AppModel.stalePairingMessage)
    }
}
