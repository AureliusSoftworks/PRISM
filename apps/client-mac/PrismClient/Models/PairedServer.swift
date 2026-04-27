import Foundation

struct PairedServer: Codable, Equatable {
    private static let defaultAPIPort = 18_787
    private static let defaultWebPort = 18_788
    private static let legacyAPIPort = 8787
    private static let legacyWebPort = 3000

    let serverURL: String
    let token: String
    let clientAccessToken: String?
    let expiresAt: Date
    let displayName: String

    var expirationSummary: String {
        expiresAt.formatted(date: .abbreviated, time: .shortened)
    }

    var webAppURL: URL? {
        guard var components = URLComponents(string: serverURL) else {
            return nil
        }
        // Pairing happens against the API port. The reusable Prism interface is
        // served by the paired server's web process on the matching web port.
        if components.port == Self.defaultAPIPort {
            components.port = Self.defaultWebPort
        } else if components.port == Self.legacyAPIPort {
            components.port = Self.legacyWebPort
        }
        components.path = "/"
        components.queryItems = nil
        return components.url
    }
}
