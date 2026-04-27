import Foundation

final class ConfigStore {
    private static let legacyDefaultAPIPort = 8787
    private static let legacyDefaultWebPort = 3000

    let applicationSupportDirectory: URL
    let logDirectory: URL

    private let envFileURL: URL

    init(fileManager: FileManager = .default) {
        let supportRoot = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        applicationSupportDirectory = supportRoot.appendingPathComponent("Prism", isDirectory: true)
        logDirectory = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Logs", isDirectory: true)
            .appendingPathComponent("Prism", isDirectory: true)
        envFileURL = applicationSupportDirectory.appendingPathComponent(".env")
    }

    func load() -> ServerConfig {
        guard
            let raw = try? String(contentsOf: envFileURL, encoding: .utf8)
        else {
            return .defaults
        }

        let env = Self.parseEnv(raw)
        var config = ServerConfig.defaults
        config.serverName = env["PRISM_SERVER_NAME"] ?? config.serverName
        config.apiPort = Self.readInt(env["API_PORT"], fallback: config.apiPort)
        config.webPort = Self.readInt(env["WEB_PORT"], fallback: config.webPort)
        if config.apiPort == Self.legacyDefaultAPIPort,
           config.webPort == Self.legacyDefaultWebPort {
            config.apiPort = ServerConfig.defaults.apiPort
            config.webPort = ServerConfig.defaults.webPort
        }
        config.discoveryEnabled = Self.readBool(env["PRISM_DISCOVERY_ENABLED"], fallback: config.discoveryEnabled)
        config.sessionCookieName = env["SESSION_COOKIE_NAME"] ?? config.sessionCookieName
        config.sessionTtlHours = Self.readInt(env["SESSION_TTL_HOURS"], fallback: config.sessionTtlHours)
        config.encryptionMasterKey = env["ENCRYPTION_MASTER_KEY"] ?? config.encryptionMasterKey
        config.ollamaHost = env["OLLAMA_HOST"] ?? config.ollamaHost
        config.ollamaModel = env["OLLAMA_MODEL"] ?? config.ollamaModel
        config.qdrantURL = env["QDRANT_URL"] ?? config.qdrantURL
        config.openAIAPIKey = env["OPENAI_API_KEY"] ?? config.openAIAPIKey
        return config
    }

    func save(_ config: ServerConfig) throws {
        try FileManager.default.createDirectory(at: applicationSupportDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: logDirectory, withIntermediateDirectories: true)

        let contents = """
        API_PORT=\(config.apiPort)
        WEB_PORT=\(config.webPort)
        PRISM_SERVER_NAME=\(config.serverName)
        PRISM_DISCOVERY_ENABLED=\(config.discoveryEnabled ? "true" : "false")
        SESSION_COOKIE_NAME=\(config.sessionCookieName)
        SESSION_TTL_HOURS=\(config.sessionTtlHours)
        ENCRYPTION_MASTER_KEY=\(config.encryptionMasterKey)
        OLLAMA_HOST=\(config.ollamaHost)
        OLLAMA_MODEL=\(config.ollamaModel)
        QDRANT_URL=\(config.qdrantURL)
        OPENAI_API_KEY=\(config.openAIAPIKey)
        NEXT_TELEMETRY_DISABLED=1
        """

        try contents.write(to: envFileURL, atomically: true, encoding: .utf8)
    }

    static func parseEnv(_ raw: String) -> [String: String] {
        raw.split(whereSeparator: \.isNewline).reduce(into: [String: String]()) { result, line in
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { return }
            let parts = trimmed.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard parts.count == 2 else { return }
            result[String(parts[0])] = String(parts[1])
        }
    }

    private static func readInt(_ value: String?, fallback: Int) -> Int {
        guard let value, let intValue = Int(value) else {
            return fallback
        }
        return intValue
    }

    private static func readBool(_ value: String?, fallback: Bool) -> Bool {
        guard let value else {
            return fallback
        }
        switch value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "1", "true", "yes", "on":
            return true
        case "0", "false", "no", "off":
            return false
        default:
            return fallback
        }
    }
}
