import Foundation
import Security

protocol ClientTokenStoring {
    func loadToken() -> String?
    func saveToken(_ token: String) throws
    func clearToken() throws
}

final class ClientKeychainTokenStore: ClientTokenStoring {
    private let service = "com.localai.prism-client"
    private let account: String

    init(account: String = "paired-session") {
        self.account = account
    }

    func loadToken() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    func saveToken(_ token: String) throws {
        try clearToken()
        var item = baseQuery()
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw ClientKeychainTokenStoreError.unhandledStatus(status)
        }
    }

    func clearToken() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw ClientKeychainTokenStoreError.unhandledStatus(status)
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

enum ClientKeychainTokenStoreError: LocalizedError {
    case unhandledStatus(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unhandledStatus(let status):
            return "Keychain operation failed with status \(status)."
        }
    }
}

private struct StoredPairedServerMetadata: Codable {
    let serverURL: String
    let expiresAt: Date
    let displayName: String

    init(server: PairedServer) {
        self.serverURL = server.serverURL
        self.expiresAt = server.expiresAt
        self.displayName = server.displayName
    }

    func pairedServer(token: String, clientAccessToken: String?) -> PairedServer {
        PairedServer(
            serverURL: serverURL,
            token: token,
            clientAccessToken: clientAccessToken,
            expiresAt: expiresAt,
            displayName: displayName
        )
    }
}

private struct LegacyStoredPairedServer: Codable {
    let serverURL: String
    let token: String
    let clientAccessToken: String?
    let expiresAt: Date
    let displayName: String

    var pairedServer: PairedServer {
        PairedServer(
            serverURL: serverURL,
            token: token,
            clientAccessToken: clientAccessToken,
            expiresAt: expiresAt,
            displayName: displayName
        )
    }
}

final class ClientConfigStore {
    let applicationSupportDirectory: URL

    private let pairedServerURL: URL
    private let tokenStore: ClientTokenStoring
    private let clientAccessTokenStore: ClientTokenStoring

    init(
        fileManager: FileManager = .default,
        applicationSupportDirectory: URL? = nil,
        tokenStore: ClientTokenStoring = ClientKeychainTokenStore(),
        clientAccessTokenStore: ClientTokenStoring = ClientKeychainTokenStore(account: "client-access")
    ) {
        if let applicationSupportDirectory {
            self.applicationSupportDirectory = applicationSupportDirectory
        } else {
            let supportRoot = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.applicationSupportDirectory = supportRoot.appendingPathComponent("PrismClient", isDirectory: true)
        }
        self.pairedServerURL = self.applicationSupportDirectory.appendingPathComponent("paired-server.json")
        self.tokenStore = tokenStore
        self.clientAccessTokenStore = clientAccessTokenStore
    }

    func loadPairedServer() -> PairedServer? {
        guard let data = try? Data(contentsOf: pairedServerURL) else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let metadata = try? decoder.decode(StoredPairedServerMetadata.self, from: data) else {
            return nil
        }

        let token = tokenStore.loadToken()
        let clientAccessToken = clientAccessTokenStore.loadToken()
        if let token, let clientAccessToken {
            return metadata.pairedServer(token: token, clientAccessToken: clientAccessToken)
        }

        // Older builds persisted both secrets in this JSON file. Move them to
        // Keychain on first load and immediately rewrite metadata without them.
        if let legacyRecord = try? decoder.decode(LegacyStoredPairedServer.self, from: data) {
            let legacy = legacyRecord.pairedServer
            if !legacy.token.isEmpty,
               let legacyClientAccessToken = legacy.clientAccessToken,
               !legacyClientAccessToken.isEmpty {
                do {
                    try save(legacy)
                    return legacy
                } catch {
                    return metadata.pairedServer(
                        token: token ?? "",
                        clientAccessToken: clientAccessToken
                    )
                }
            }
        }

        // Preserve a stale marker so AppModel can clear incomplete metadata and
        // either missing Keychain credential instead of silently retaining it.
        return metadata.pairedServer(
            token: token ?? "",
            clientAccessToken: clientAccessToken
        )
    }

    func save(_ server: PairedServer) throws {
        try FileManager.default.createDirectory(at: applicationSupportDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(StoredPairedServerMetadata(server: server))
        try data.write(to: pairedServerURL, options: .atomic)

        do {
            try tokenStore.saveToken(server.token)
            if let clientAccessToken = server.clientAccessToken, !clientAccessToken.isEmpty {
                try clientAccessTokenStore.saveToken(clientAccessToken)
            } else {
                try clientAccessTokenStore.clearToken()
            }
        } catch {
            try? clearPairedServer()
            throw error
        }
    }

    func clearPairedServer() throws {
        var firstError: Error?
        if FileManager.default.fileExists(atPath: pairedServerURL.path) {
            do {
                try FileManager.default.removeItem(at: pairedServerURL)
            } catch {
                firstError = error
            }
        }
        do {
            try tokenStore.clearToken()
        } catch {
            firstError = firstError ?? error
        }
        do {
            try clientAccessTokenStore.clearToken()
        } catch {
            firstError = firstError ?? error
        }
        if let firstError {
            throw firstError
        }
    }
}
