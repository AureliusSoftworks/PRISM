import Foundation

struct DisplayPairingCode: Equatable {
    let code: String
    let expiresAt: Date

    var expirationSummary: String {
        expiresAt.formatted(date: .omitted, time: .shortened)
    }
}

final class PairingCodeService {
    private struct Response: Decodable {
        struct PairingCodePayload: Decodable {
            let code: String
            let expiresAt: Date
        }

        let ok: Bool
        let pairingCode: PairingCodePayload
    }

    func createPairingCode(apiPort: Int) async throws -> DisplayPairingCode {
        guard let url = URL(string: "http://127.0.0.1:\(apiPort)/api/local/pairing/codes") else {
            throw PairingCodeError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 5

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 201 else {
            throw PairingCodeError.requestFailed("Could not generate a pairing code. Make sure Prism Server is running.")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(Response.self, from: data)
        guard decoded.ok else {
            throw PairingCodeError.requestFailed("Prism Server did not accept the pairing request.")
        }

        return DisplayPairingCode(
            code: decoded.pairingCode.code,
            expiresAt: decoded.pairingCode.expiresAt
        )
    }
}

enum PairingCodeError: LocalizedError {
    case invalidURL
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Could not build the local pairing URL."
        case .requestFailed(let message):
            return message
        }
    }
}
