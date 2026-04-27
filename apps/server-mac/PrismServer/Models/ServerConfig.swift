import Foundation

struct ServerConfig: Equatable {
    var serverName: String
    var apiPort: Int
    var webPort: Int
    var discoveryEnabled: Bool
    var sessionCookieName: String
    var sessionTtlHours: Int
    var encryptionMasterKey: String
    var ollamaHost: String
    var ollamaModel: String
    var qdrantURL: String
    var openAIAPIKey: String

    static let defaults = ServerConfig(
        serverName: "Prism Server",
        apiPort: 8787,
        webPort: 3000,
        discoveryEnabled: true,
        sessionCookieName: "localai_session",
        sessionTtlHours: 24,
        encryptionMasterKey: "change-me-to-a-long-random-secret",
        ollamaHost: "http://localhost:11434",
        ollamaModel: "llama3.2",
        qdrantURL: "http://localhost:6333",
        openAIAPIKey: ""
    )

    func environment(applicationSupportDirectory: URL) -> [String: String] {
        var env: [String: String] = [
            "API_PORT": String(apiPort),
            "PORT": String(webPort),
            "HOSTNAME": "127.0.0.1",
            "LOCALAI_API_ORIGIN": "http://127.0.0.1:\(apiPort)",
            "PRISM_SERVER_NAME": serverName,
            "PRISM_DISCOVERY_ENABLED": discoveryEnabled ? "true" : "false",
            "SESSION_COOKIE_NAME": sessionCookieName,
            "SESSION_TTL_HOURS": String(sessionTtlHours),
            "ENCRYPTION_MASTER_KEY": encryptionMasterKey,
            "OLLAMA_HOST": ollamaHost,
            "OLLAMA_MODEL": ollamaModel,
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
