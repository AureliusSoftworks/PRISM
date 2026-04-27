import XCTest
@testable import PrismServer

final class ConfigStoreTests: XCTestCase {
    func testParseEnvSkipsCommentsAndBlankLines() {
        let env = ConfigStore.parseEnv(
            """
            # Prism Server
            API_PORT=8787

            PRISM_SERVER_NAME=Kitchen Mac
            """
        )

        XCTAssertEqual(env["API_PORT"], "8787")
        XCTAssertEqual(env["PRISM_SERVER_NAME"], "Kitchen Mac")
        XCTAssertNil(env["# Prism Server"])
    }
}
