import XCTest
@testable import PrismIOS

final class PairingExchangeServiceTests: XCTestCase {
    func testNormalizesServerURL() throws {
        XCTAssertEqual(
            try PairingExchangeService.normalizedServerURL("127.0.0.1:18787/").absoluteString,
            "http://127.0.0.1:18787"
        )
    }

    func testRejectsBindAllServerURL() {
        XCTAssertThrowsError(try PairingExchangeService.normalizedServerURL("0.0.0.0:18787")) { error in
            XCTAssertTrue(error.localizedDescription.contains("Mac's LAN address"))
        }
    }

    func testNormalizesPairingCode() throws {
        XCTAssertEqual(
            try PairingExchangeService.normalizedPairingCode("abcd efgh-jklm"),
            "ABCD-EFGH-JKLM"
        )
    }

    func testRejectsShortPairingCode() {
        XCTAssertThrowsError(try PairingExchangeService.normalizedPairingCode("ABCD"))
    }

    func testFormatsDiscoveredServerURL() {
        XCTAssertEqual(
            ServerDiscoveryService.serverURL(hostName: "Prism-Server.local.", port: 18787),
            "http://Prism-Server.local:18787"
        )
    }
}
