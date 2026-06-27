import XCTest
@testable import PrismServer

final class ConfigStoreTests: XCTestCase {
    func testParseEnvSkipsCommentsAndBlankLines() {
        let env = ConfigStore.parseEnv(
            """
            # Prism Server
            API_PORT=18787

            PRISM_SERVER_NAME=Kitchen Mac
            """
        )

        XCTAssertEqual(env["API_PORT"], "18787")
        XCTAssertEqual(env["PRISM_SERVER_NAME"], "Kitchen Mac")
        XCTAssertNil(env["# Prism Server"])
    }

    func testServerEnvironmentIsPrivateByDefault() {
        let supportURL = URL(fileURLWithPath: "/tmp/prism-test-support", isDirectory: true)
        let env = ServerConfig.defaults.environment(applicationSupportDirectory: supportURL)

        // Private by default: web binds to loopback until LAN access is enabled.
        XCTAssertEqual(env["HOSTNAME"], "127.0.0.1")
        XCTAssertEqual(env["PRISM_LAN_ACCESS"], "false")
        XCTAssertEqual(env["LOCALAI_API_ORIGIN"], "http://127.0.0.1:18787")
    }

    func testServerEnvironmentBindsWebSurfaceToLanWhenEnabled() {
        let supportURL = URL(fileURLWithPath: "/tmp/prism-test-support", isDirectory: true)
        var config = ServerConfig.defaults
        config.lanAccessEnabled = true
        let env = config.environment(applicationSupportDirectory: supportURL)

        XCTAssertEqual(env["HOSTNAME"], "0.0.0.0")
        XCTAssertEqual(env["PRISM_LAN_ACCESS"], "true")
        XCTAssertEqual(env["PRISM_WEB_LAN"], "1")
    }
}
