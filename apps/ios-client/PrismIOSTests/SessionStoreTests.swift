import XCTest
@testable import PrismIOS

final class SessionStoreTests: XCTestCase {
    func testSaveLoadAndClearSession() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = SessionStore(
            applicationSupportDirectory: directory,
            tokenStore: MemoryTokenStore(),
            clientAccessTokenStore: MemoryTokenStore()
        )
        let session = PairedSession(
            server: PairedServer(
                serverURL: "http://127.0.0.1:18787",
                expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
                displayName: "Prism Owner"
            ),
            token: "session-token",
            clientAccessToken: "client-access-token"
        )

        try store.save(session)
        XCTAssertEqual(store.loadSession(), session)

        try store.clearSession()
        XCTAssertNil(store.loadSession())
    }

    func testMapsApiPortToWebAppURL() throws {
        let server = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        XCTAssertEqual(server.webAppURL?.absoluteString, "http://127.0.0.1:18788/")
    }

    func testMapsLegacyApiPortToLegacyWebAppURL() throws {
        let server = PairedServer(
            serverURL: "http://127.0.0.1:8787",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        XCTAssertEqual(server.webAppURL?.absoluteString, "http://127.0.0.1:3000/")
    }
}
