import XCTest
@testable import PrismClient

final class PairingExchangeServiceTests: XCTestCase {
    func testNormalizesServerURL() throws {
        XCTAssertEqual(
            try PairingExchangeService.normalizedServerURL("127.0.0.1:18787/").absoluteString,
            "http://127.0.0.1:18787"
        )
        XCTAssertEqual(
            try PairingExchangeService.normalizedServerURL("0.0.0.0:18787").absoluteString,
            "http://127.0.0.1:18787"
        )
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
}
