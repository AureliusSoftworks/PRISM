import XCTest
@testable import PrismClient

final class ClientConfigStoreTests: XCTestCase {
    func testSaveLoadAndClearPairedServer() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = ClientConfigStore(applicationSupportDirectory: directory)
        let server = PairedServer(
            serverURL: "http://127.0.0.1:8787",
            token: "session-token",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        try store.save(server)
        XCTAssertEqual(store.loadPairedServer(), server)

        try store.clearPairedServer()
        XCTAssertNil(store.loadPairedServer())
    }
}
