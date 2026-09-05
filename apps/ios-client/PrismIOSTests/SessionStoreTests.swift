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
        let metadata = try String(
            contentsOf: directory.appendingPathComponent("paired-server.json"),
            encoding: .utf8
        )
        XCTAssertFalse(metadata.contains("session-token"))
        XCTAssertFalse(metadata.contains("client-access-token"))

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
}
