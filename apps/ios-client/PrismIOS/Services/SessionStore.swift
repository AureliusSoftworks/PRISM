import Foundation

final class SessionStore {
    private let metadataURL: URL
    private let tokenStore: TokenStoring
    private let clientAccessTokenStore: TokenStoring

    init(
        fileManager: FileManager = .default,
        applicationSupportDirectory: URL? = nil,
        tokenStore: TokenStoring = KeychainTokenStore(),
        clientAccessTokenStore: TokenStoring = KeychainTokenStore(account: "client-access")
    ) {
        let root = applicationSupportDirectory ?? fileManager
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!
            .appendingPathComponent("PrismIOS", isDirectory: true)
        self.metadataURL = root.appendingPathComponent("paired-server.json")
        self.tokenStore = tokenStore
        self.clientAccessTokenStore = clientAccessTokenStore
    }

    func loadSession() -> PairedSession? {
        guard
            let data = try? Data(contentsOf: metadataURL),
            let token = tokenStore.loadToken(),
            let clientAccessToken = clientAccessTokenStore.loadToken()
        else {
            return nil
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let server = try? decoder.decode(PairedServer.self, from: data) else {
            return nil
        }
        return PairedSession(server: server, token: token, clientAccessToken: clientAccessToken)
    }

    func save(_ session: PairedSession) throws {
        try FileManager.default.createDirectory(
            at: metadataURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(session.server)
        try data.write(to: metadataURL, options: .atomic)
        try tokenStore.saveToken(session.token)
        try clientAccessTokenStore.saveToken(session.clientAccessToken)
    }

    func clearSession() throws {
        if FileManager.default.fileExists(atPath: metadataURL.path) {
            try FileManager.default.removeItem(at: metadataURL)
        }
        try tokenStore.clearToken()
        try clientAccessTokenStore.clearToken()
    }
}
