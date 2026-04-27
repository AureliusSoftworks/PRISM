import Foundation

struct DiscoveredServer: Identifiable, Equatable {
    let id: String
    let name: String
    let url: String
}

final class ServerDiscoveryService: NSObject {
    private static let serviceType = "_prism._tcp."
    private static let domain = "local."

    private let browser = NetServiceBrowser()
    private var resolvingServices: [NetService] = []
    private var didStart = false

    var onServersChanged: (([DiscoveredServer]) -> Void)?
    private(set) var servers: [DiscoveredServer] = []

    override init() {
        super.init()
        browser.delegate = self
    }

    func start() {
        guard !didStart else { return }
        didStart = true
        browser.searchForServices(ofType: Self.serviceType, inDomain: Self.domain)
    }

    func stop() {
        guard didStart else { return }
        didStart = false
        browser.stop()
        resolvingServices.forEach { $0.stop() }
        resolvingServices.removeAll()
    }

    static func serverURL(hostName: String, port: Int) -> String {
        let normalizedHost = hostName.hasSuffix(".") ? String(hostName.dropLast()) : hostName
        return "http://\(normalizedHost):\(port)"
    }

    private func upsert(_ server: DiscoveredServer) {
        if let index = servers.firstIndex(where: { $0.id == server.id }) {
            servers[index] = server
        } else {
            servers.append(server)
        }
        onServersChanged?(servers)
    }
}

extension ServerDiscoveryService: NetServiceBrowserDelegate {
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        service.delegate = self
        resolvingServices.append(service)
        service.resolve(withTimeout: 5)
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        servers.removeAll { $0.id == service.name }
        resolvingServices.removeAll { $0.name == service.name }
        onServersChanged?(servers)
    }
}

extension ServerDiscoveryService: NetServiceDelegate {
    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let hostName = sender.hostName, sender.port > 0 else {
            return
        }

        upsert(
            DiscoveredServer(
                id: sender.name,
                name: sender.name,
                url: Self.serverURL(hostName: hostName, port: sender.port)
            )
        )
    }
}
