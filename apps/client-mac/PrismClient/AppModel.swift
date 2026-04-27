import Foundation

@MainActor
final class AppModel: ObservableObject {
    static let stalePairingMessage = "Saved pairing needs to be refreshed. Pair with Prism Server again."

    @Published var serverURL = "http://127.0.0.1:18787"
    @Published var pairingCode = ""
    @Published var pairedServer: PairedServer?
    @Published var statusMessage: String?
    @Published var isPairing = false

    private let configStore: ClientConfigStore
    private let pairingService: PairingExchangeService

    init(
        configStore: ClientConfigStore = ClientConfigStore(),
        pairingService: PairingExchangeService = PairingExchangeService()
    ) {
        self.configStore = configStore
        self.pairingService = pairingService
        let storedPairing = configStore.loadPairedServer()
        if let pairedServer = storedPairing, Self.isStoredPairingUsable(pairedServer) {
            self.pairedServer = pairedServer
            self.serverURL = pairedServer.serverURL
            self.statusMessage = "Paired with \(pairedServer.displayName)."
        } else if storedPairing != nil {
            do {
                try configStore.clearPairedServer()
                self.statusMessage = Self.stalePairingMessage
            } catch {
                self.statusMessage = "\(Self.stalePairingMessage) Clearing the old pairing failed: \(error.localizedDescription)"
            }
        }
    }

    var isPaired: Bool {
        pairedServer != nil
    }

    func pair() {
        guard !isPairing else { return }
        isPairing = true
        statusMessage = "Pairing with Prism Server..."

        Task {
            defer { isPairing = false }
            do {
                let server = try await pairingService.exchange(serverURL: serverURL, code: pairingCode)
                try configStore.save(server)
                pairedServer = server
                pairingCode = ""
                statusMessage = "Paired with \(server.displayName)."
            } catch {
                statusMessage = error.localizedDescription
            }
        }
    }

    func forgetServer() {
        do {
            try configStore.clearPairedServer()
            pairedServer = nil
            statusMessage = "Pairing cleared."
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private static func isStoredPairingUsable(_ server: PairedServer, now: Date = Date()) -> Bool {
        guard
            let clientAccessToken = server.clientAccessToken?.trimmingCharacters(in: .whitespacesAndNewlines),
            !clientAccessToken.isEmpty,
            server.expiresAt > now,
            server.webAppURL != nil
        else {
            return false
        }
        return true
    }
}
