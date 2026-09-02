import XCTest
@testable import PrismClient

final class ClientConfigStoreTests: XCTestCase {
    func testSaveLoadAndClearPairedServer() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let tokenStore = MemoryClientTokenStore()
        let clientAccessTokenStore = MemoryClientTokenStore()
        let store = ClientConfigStore(
            applicationSupportDirectory: directory,
            tokenStore: tokenStore,
            clientAccessTokenStore: clientAccessTokenStore
        )
        let server = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            token: "session-token",
            clientAccessToken: "client-access-token",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        try store.save(server)
        XCTAssertEqual(store.loadPairedServer(), server)
        let metadata = try String(
            contentsOf: directory.appendingPathComponent("paired-server.json"),
            encoding: .utf8
        )
        XCTAssertFalse(metadata.contains("session-token"))
        XCTAssertFalse(metadata.contains("client-access-token"))
        XCTAssertEqual(tokenStore.loadToken(), "session-token")
        XCTAssertEqual(clientAccessTokenStore.loadToken(), "client-access-token")

        try store.clearPairedServer()
        XCTAssertNil(store.loadPairedServer())
        XCTAssertNil(tokenStore.loadToken())
        XCTAssertNil(clientAccessTokenStore.loadToken())
    }

    func testMigratesLegacyPlaintextPairingSecretsIntoTokenStores() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let tokenStore = MemoryClientTokenStore()
        let clientAccessTokenStore = MemoryClientTokenStore()
        let store = ClientConfigStore(
            applicationSupportDirectory: directory,
            tokenStore: tokenStore,
            clientAccessTokenStore: clientAccessTokenStore
        )
        let legacy = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            token: "legacy-session-token",
            clientAccessToken: "legacy-client-access-token",
            expiresAt: Date(timeIntervalSince1970: 1_967_225_900),
            displayName: "Prism Owner"
        )
        let legacyData = try JSONSerialization.data(withJSONObject: [
            "serverURL": legacy.serverURL,
            "token": legacy.token,
            "clientAccessToken": legacy.clientAccessToken as Any,
            "expiresAt": ISO8601DateFormatter().string(from: legacy.expiresAt),
            "displayName": legacy.displayName
        ])
        try legacyData.write(
            to: directory.appendingPathComponent("paired-server.json"),
            options: .atomic
        )

        XCTAssertEqual(store.loadPairedServer(), legacy)
        XCTAssertEqual(tokenStore.loadToken(), legacy.token)
        XCTAssertEqual(clientAccessTokenStore.loadToken(), legacy.clientAccessToken)
        let rewritten = try String(
            contentsOf: directory.appendingPathComponent("paired-server.json"),
            encoding: .utf8
        )
        XCTAssertFalse(rewritten.contains("legacy-session-token"))
        XCTAssertFalse(rewritten.contains("legacy-client-access-token"))
    }

    func testBuildsHttpOnlyWebKitCookiesForBothNativeCredentials() throws {
        let origin = try XCTUnwrap(URL(string: "https://prism.local:18788/"))
        for name in ["localai_session", "prism_client_access"] {
            let cookie = try XCTUnwrap(prismClientCookie(
                name: name,
                value: "account-bound-secret",
                originURL: origin,
                expiresAt: Date(timeIntervalSince1970: 1_967_225_900)
            ))
            XCTAssertTrue(cookie.isHTTPOnly)
            XCTAssertTrue(cookie.isSecure)
            XCTAssertEqual(cookie.name, name)
            XCTAssertEqual(cookie.sameSitePolicy, .sameSiteLax)
        }
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
        let store = ClientConfigStore(
            applicationSupportDirectory: directory,
            tokenStore: MemoryClientTokenStore(),
            clientAccessTokenStore: MemoryClientTokenStore()
        )
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

private final class MemoryClientTokenStore: ClientTokenStoring {
    private var token: String?

    func loadToken() -> String? {
        token
    }

    func saveToken(_ token: String) throws {
        self.token = token
    }

    func clearToken() throws {
        token = nil
    }
}
