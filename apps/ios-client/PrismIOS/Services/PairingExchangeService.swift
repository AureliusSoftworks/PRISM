import Foundation

final class PairingExchangeService {
    private static let requestTimeout: TimeInterval = 8

    private struct PairingExchangeResponse: Decodable {
        struct User: Decodable {
            let displayName: String
        }

        let ok: Bool
        let token: String
        let clientAccessToken: String
        let expiresAt: String
        let user: User
    }

    private struct HealthResponse: Decodable {
        let ok: Bool
        let serverName: String
    }

    func validateServer(serverURL rawServerURL: String) async throws -> String {
        let serverURL = try Self.normalizedServerURL(rawServerURL)
        let endpoint = try Self.endpoint(base: serverURL, path: "/api/health")
        var request = URLRequest(url: endpoint)
        request.timeoutInterval = Self.requestTimeout
        let (data, response) = try await Self.send(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw PairingExchangeError.requestFailed("Prism Server did not respond to the health check.")
        }
        let decoded = try JSONDecoder().decode(HealthResponse.self, from: data)
        guard decoded.ok else {
            throw PairingExchangeError.requestFailed("Prism Server is reachable but not ready.")
        }
        return decoded.serverName
    }

    func exchange(serverURL rawServerURL: String, code rawCode: String) async throws -> PairedSession {
        let serverURL = try Self.normalizedServerURL(rawServerURL)
        _ = try await validateServer(serverURL: serverURL.absoluteString)
        let code = try Self.normalizedPairingCode(rawCode)
        let endpoint = try Self.endpoint(base: serverURL, path: "/api/pairing/exchange")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = Self.requestTimeout
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code])

        let (data, response) = try await Self.send(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw PairingExchangeError.requestFailed("Pairing failed. Check the server address and code, then try again.")
        }

        let decoded = try JSONDecoder().decode(PairingExchangeResponse.self, from: data)
        guard decoded.ok else {
            throw PairingExchangeError.requestFailed("Prism Server rejected the pairing request.")
        }

        let server = PairedServer(
            serverURL: serverURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
            expiresAt: try Self.decodeDate(decoded.expiresAt),
            displayName: decoded.user.displayName
        )
        return PairedSession(
            server: server,
            token: decoded.token,
            clientAccessToken: decoded.clientAccessToken
        )
    }

    static func normalizedServerURL(_ raw: String) throws -> URL {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            throw PairingExchangeError.invalidServerURL("Enter the Prism Server address.")
        }
        if !trimmed.lowercased().hasPrefix("http://") && !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "http://\(trimmed)"
        }
        while trimmed.hasSuffix("/") {
            trimmed = String(trimmed.dropLast())
        }
        guard let url = URL(string: trimmed), url.scheme != nil, url.host != nil else {
            throw PairingExchangeError.invalidServerURL("Enter a valid Prism Server address.")
        }
        if url.host == "0.0.0.0" {
            throw PairingExchangeError.invalidServerURL("Use your Mac's LAN address, such as http://192.168.0.49:18787. 0.0.0.0 is only for the server to listen, not for iPhone connections.")
        }
        return url
    }

    static func normalizedPairingCode(_ raw: String) throws -> String {
        let allowed = CharacterSet.alphanumerics
        let compact = raw
            .uppercased()
            .unicodeScalars
            .filter { allowed.contains($0) }
            .map(String.init)
            .joined()

        guard compact.count == 12 else {
            throw PairingExchangeError.invalidCode("Enter the 12-character pairing code from Prism Server.")
        }

        let first = compact.prefix(4)
        let middleStart = compact.index(compact.startIndex, offsetBy: 4)
        let middleEnd = compact.index(compact.startIndex, offsetBy: 8)
        let middle = compact[middleStart..<middleEnd]
        let last = compact.suffix(4)
        return "\(first)-\(middle)-\(last)"
    }

    private static func endpoint(base: URL, path: String) throws -> URL {
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            throw PairingExchangeError.invalidServerURL("Enter a valid Prism Server address.")
        }
        components.path = path
        components.queryItems = nil
        guard let url = components.url else {
            throw PairingExchangeError.invalidServerURL("Enter a valid Prism Server address.")
        }
        return url
    }

    private static func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await URLSession.shared.data(for: request)
        } catch let error as URLError {
            throw PairingExchangeError.requestFailed(networkMessage(for: error))
        }
    }

    private static func networkMessage(for error: URLError) -> String {
        switch error.code {
        case .timedOut:
            return "Prism Server did not answer in time. Make sure the iPhone and Mac are on the same Wi-Fi network, then use the Mac's LAN address."
        case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost:
            return "Prism Server is not reachable from this iPhone. Use the Mac's LAN address, not localhost or 0.0.0.0."
        default:
            return "Could not reach Prism Server: \(error.localizedDescription)"
        }
    }

    private static func decodeDate(_ raw: String) throws -> Date {
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: raw) {
            return date
        }
        if let date = ISO8601DateFormatter().date(from: raw) {
            return date
        }
        throw PairingExchangeError.requestFailed("Prism Server returned an unreadable session expiry.")
    }
}

enum PairingExchangeError: LocalizedError {
    case invalidServerURL(String)
    case invalidCode(String)
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidServerURL(let message), .invalidCode(let message), .requestFailed(let message):
            return message
        }
    }
}
