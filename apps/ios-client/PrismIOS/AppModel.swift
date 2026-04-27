import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var serverURL = ""
    @Published var pairingCode = ""
    @Published var discoveredServers: [DiscoveredServer] = []
    @Published var session: PairedSession?
    @Published var statusMessage: String?
    @Published var isPairing = false
    @Published var isDiscoveringServer = false

    private let sessionStore: SessionStore
    private let pairingService: PairingExchangeService
    private let discoveryService: ServerDiscoveryService

    init(
        sessionStore: SessionStore = SessionStore(),
        pairingService: PairingExchangeService = PairingExchangeService(),
        discoveryService: ServerDiscoveryService = ServerDiscoveryService()
    ) {
        self.sessionStore = sessionStore
        self.pairingService = pairingService
        self.discoveryService = discoveryService
        self.session = sessionStore.loadSession()
        if let session {
            self.serverURL = session.server.serverURL
            self.statusMessage = "Connected to \(session.server.displayName)."
        } else {
            startDiscovery()
        }
    }

    func pair() {
        guard !isPairing else { return }
        guard !serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            statusMessage = "Searching for Prism Server on your local network..."
            startDiscovery()
            return
        }
        isPairing = true
        statusMessage = "Pairing with Prism Server..."

        Task {
            defer { isPairing = false }
            do {
                let pairedSession = try await pairingService.exchange(serverURL: serverURL, code: pairingCode)
                try sessionStore.save(pairedSession)
                session = pairedSession
                stopDiscovery()
                pairingCode = ""
                statusMessage = "Connected to \(pairedSession.server.displayName)."
            } catch {
                statusMessage = error.localizedDescription
            }
        }
    }

    func disconnect() {
        do {
            try sessionStore.clearSession()
            session = nil
            statusMessage = "Disconnected from Prism Server."
            startDiscovery()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func startDiscovery() {
        isDiscoveringServer = true
        discoveryService.onServersChanged = { [weak self] servers in
            Task { @MainActor in
                self?.handleDiscoveredServers(servers)
            }
        }
        discoveryService.start()
    }

    private func stopDiscovery() {
        isDiscoveringServer = false
        discoveryService.stop()
    }

    private func handleDiscoveredServers(_ servers: [DiscoveredServer]) {
        discoveredServers = servers
        guard let first = servers.first else {
            return
        }
        if serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            serverURL = first.url
            statusMessage = "Found \(first.name). Enter the pairing code to connect."
        }
    }
}
