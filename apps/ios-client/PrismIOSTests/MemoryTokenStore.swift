@testable import PrismIOS

final class MemoryTokenStore: TokenStoring {
    private var token: String?

    func loadToken() -> String? {
        token
    }

    func saveToken(_ token: String) throws {
        self.token = token
    }

    func clearToken() throws {
        token = nil
    }
}
