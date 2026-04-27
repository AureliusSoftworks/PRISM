import Foundation

/// How Prism should treat the Qdrant process for start/stop and UI copy.
enum QdrantOwnership: String, Equatable, Sendable {
    case managedByPrism
    case externalUserManaged
}

/// Resolved at runtime so UI, Node `QDRANT_URL`, and lifecycle agree (single source of truth).
struct QdrantResolution: Equatable, Sendable {
    let ownership: QdrantOwnership
    /// Value passed to child processes as `QDRANT_URL` (may differ from `ServerConfig` when Prism manages a sidecar).
    let effectiveQdrantURL: String
}

enum QdrantResolutionService {
    /// Prism `external` if Qdrant is already up at the effective URL; otherwise Prism will spawn a **managed** sidecar on the default local port.
    static func resolve(config: ServerConfig) async -> QdrantResolution {
        let nConfig = QdrantURL.normalize(config.qdrantURL)
        let nDefault = QdrantURL.normalize(ServerConfig.defaults.qdrantURL)
        if nConfig != nDefault, await isReadyzReachable(base: nConfig) {
            return QdrantResolution(ownership: .externalUserManaged, effectiveQdrantURL: nConfig)
        }
        // Pre-existing Qdrant on the default address (Docker, another install): use it; do not start a second.
        if nConfig == nDefault, await isReadyzReachable(base: nDefault) {
            return QdrantResolution(ownership: .externalUserManaged, effectiveQdrantURL: nDefault)
        }
        return QdrantResolution(ownership: .managedByPrism, effectiveQdrantURL: nDefault)
    }

    private static func isReadyzReachable(base: String) async -> Bool {
        guard let url = QdrantURL.readyzURL(forBase: base) else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }
}
