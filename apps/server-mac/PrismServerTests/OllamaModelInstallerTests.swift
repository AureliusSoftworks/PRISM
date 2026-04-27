import XCTest
@testable import PrismServer

final class OllamaModelInstallerTests: XCTestCase {
    func testValidatedModelNameAcceptsCommonOllamaNames() throws {
        XCTAssertEqual(try OllamaModelInstaller.validatedModelName(" llama3.2:latest "), "llama3.2:latest")
        XCTAssertEqual(try OllamaModelInstaller.validatedModelName("library/qwen2.5-coder"), "library/qwen2.5-coder")
    }

    func testValidatedModelNameRejectsEmptyOrShellLikeInput() {
        XCTAssertThrowsError(try OllamaModelInstaller.validatedModelName("   "))
        XCTAssertThrowsError(try OllamaModelInstaller.validatedModelName("llama3.2; rm -rf /"))
    }
}
