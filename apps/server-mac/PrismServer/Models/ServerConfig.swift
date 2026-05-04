import Foundation

struct ServerConfig: Equatable {
    private static let lanWebBindHost = "0.0.0.0"
    private static let localAPIOriginHost = "127.0.0.1"

    var serverName: String
    var apiPort: Int
    var webPort: Int
    var discoveryEnabled: Bool
    var sessionCookieName: String
    var sessionTtlHours: Int
    var encryptionMasterKey: String
    var ollamaHost: String
    var ollamaModel: String
    var ollamaAuxiliaryModel: String
    var ollamaEmbeddingModel: String
    var qdrantURL: String
    var openAIAPIKey: String

    static let requiredLocalModels = RequiredLocalModels(
        chat: "llama3.2",
        auxiliary: "llama3.2",
        embedding: "nomic-embed-text"
    )

    static let defaults = ServerConfig(
        serverName: "Prism Server",
        apiPort: 18_787,
        webPort: 18_788,
        discoveryEnabled: true,
        sessionCookieName: "localai_session",
        sessionTtlHours: 24,
        encryptionMasterKey: "change-me-to-a-long-random-secret",
        ollamaHost: "http://localhost:11434",
        ollamaModel: "llama3.2",
        ollamaAuxiliaryModel: "llama3.2",
        ollamaEmbeddingModel: "nomic-embed-text",
        qdrantURL: "http://127.0.0.1:6333",
        openAIAPIKey: ""
    )

    func environment(applicationSupportDirectory: URL) -> [String: String] {
        var env: [String: String] = [
            "API_PORT": String(apiPort),
            "PORT": String(webPort),
            "HOSTNAME": Self.lanWebBindHost,
            "LOCALAI_API_ORIGIN": "http://\(Self.localAPIOriginHost):\(apiPort)",
            "PRISM_SERVER_NAME": serverName,
            "PRISM_DISCOVERY_ENABLED": discoveryEnabled ? "true" : "false",
            "SESSION_COOKIE_NAME": sessionCookieName,
            "SESSION_TTL_HOURS": String(sessionTtlHours),
            "ENCRYPTION_MASTER_KEY": encryptionMasterKey,
            "OLLAMA_HOST": ollamaHost,
            "OLLAMA_MODEL": ollamaModel,
            "OLLAMA_AUXILIARY_MODEL": ollamaAuxiliaryModel,
            "OLLAMA_EMBEDDING_MODEL": ollamaEmbeddingModel,
            "QDRANT_URL": qdrantURL,
            "LOCALAI_DATA_DIR": applicationSupportDirectory.appendingPathComponent("Data").path,
            "NEXT_TELEMETRY_DISABLED": "1",
            "NODE_ENV": "production"
        ]

        if !openAIAPIKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            env["OPENAI_API_KEY"] = openAIAPIKey
        }

        return env
    }
}

struct RequiredLocalModels: Equatable {
    let chat: String
    let auxiliary: String
    let embedding: String

    var uniqueInstallOrder: [String] {
        var seen = Set<String>()
        return [chat, auxiliary, embedding]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { seen.insert($0).inserted }
    }
}
