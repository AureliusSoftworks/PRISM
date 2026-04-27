import XCTest
@testable import PrismServer

final class PairingCodeServiceTests: XCTestCase {
    func testDisplayPairingCodeStoresCodeAndExpiry() throws {
        let date = Date(timeIntervalSince1970: 1_767_225_900)
        let code = DisplayPairingCode(code: "ABCD-EFGH-JKLM", expiresAt: date)

        XCTAssertEqual(code.code, "ABCD-EFGH-JKLM")
        XCTAssertFalse(code.expirationSummary.isEmpty)
    }
}
