import XCTest
@testable import PrismServer

final class QdrantURLTests: XCTestCase {
    func testNormalizesNoSchemeAndBindAll() {
        XCTAssertEqual(
            QdrantURL.normalize("0.0.0.0:6333"),
            "http://127.0.0.1:6333"
        )
        XCTAssertEqual(
            QdrantURL.normalize("http://127.0.0.1:6333/"),
            "http://127.0.0.1:6333"
        )
    }
}
