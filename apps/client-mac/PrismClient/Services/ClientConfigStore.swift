import Foundation

final class ClientConfigStore {
    let applicationSupportDirectory: URL

    private let pairedServerURL: URL

    init(fileManager: FileManager = .default, applicationSupportDirectory: URL? = nil) {
        if let applicationSupportDirectory {
            self.applicationSupportDirectory = applicationSupportDirectory
        } else {
            let supportRoot = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.applicationSupportDirectory = supportRoot.appendingPathComponent("PrismClient", isDirectory: true)
        }
        self.pairedServerURL = self.applicationSupportDirectory.appendingPathComponent("paired-server.json")
    }

    func loadPairedServer() -> PairedServer? {
        guard let data = try? Data(contentsOf: pairedServerURL) else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(PairedServer.self, from: data)
    }

    func save(_ server: PairedServer) throws {
        try FileManager.default.createDirectory(at: applicationSupportDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(server)
        try data.write(to: pairedServerURL, options: .atomic)
    }

    func clearPairedServer() throws {
        guard FileManager.default.fileExists(atPath: pairedServerURL.path) else {
            return
        }
        try FileManager.default.removeItem(at: pairedServerURL)
    }
}
