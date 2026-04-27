import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var serverURL = "http://127.0.0.1:8787"
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
        self.pairedServer = configStore.loadPairedServer()
        if let pairedServer {
            self.serverURL = pairedServer.serverURL
            self.statusMessage = "Paired with \(pairedServer.displayName)."
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
}
