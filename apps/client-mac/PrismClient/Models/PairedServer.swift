import Foundation

struct PairedServer: Codable, Equatable {
    let serverURL: String
    let token: String
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
        if components.port == 8787 {
            components.port = 3000
        }
        components.path = "/"
        components.queryItems = nil
        return components.url
    }
}
