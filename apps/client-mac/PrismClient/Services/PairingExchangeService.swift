import Foundation

final class PairingExchangeService {
    private struct PairingExchangeResponse: Decodable {
        struct User: Decodable {
            let displayName: String
        }

        let ok: Bool
        let token: String
        let expiresAt: String
        let user: User
    }

    func exchange(serverURL rawServerURL: String, code rawCode: String) async throws -> PairedServer {
        let serverURL = try Self.normalizedServerURL(rawServerURL)
        let code = try Self.normalizedPairingCode(rawCode)
        let endpoint = serverURL.appendingPathComponent("api/pairing/exchange")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw PairingExchangeError.requestFailed("Pairing failed. Check the server address and code, then try again.")
        }

        let decoded = try JSONDecoder().decode(PairingExchangeResponse.self, from: data)
        guard decoded.ok else {
            throw PairingExchangeError.requestFailed("Prism Server rejected the pairing request.")
        }

        return PairedServer(
            serverURL: serverURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
            token: decoded.token,
            expiresAt: try Self.decodeDate(decoded.expiresAt),
            displayName: decoded.user.displayName
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
        trimmed = trimmed.replacingOccurrences(of: "//0.0.0.0", with: "//127.0.0.1", options: .caseInsensitive)
        while trimmed.hasSuffix("/") {
            trimmed = String(trimmed.dropLast())
        }
        guard let url = URL(string: trimmed), url.scheme != nil, url.host != nil else {
            throw PairingExchangeError.invalidServerURL("Enter a valid Prism Server address.")
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
