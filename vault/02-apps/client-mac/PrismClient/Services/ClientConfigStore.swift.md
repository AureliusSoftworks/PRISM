---
title: "apps/client-mac/PrismClient/Services/ClientConfigStore.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClient/Services/ClientConfigStore.swift"
status: "active"
---

# apps/client-mac/PrismClient/Services/ClientConfigStore.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/PrismClient.build/Debug/PrismClient.build/Objects-normal/arm64/PrismClient-OutputFileMap.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/0a8fe3e451170847a2385a8ed5362452.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/1c28f9c887f9894a78651475a7b63114.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/60e558427db1bdac77015dc094c7f897.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/b6b5bf691b1edaf107c5d0547f4c5a85.xcbuilddata/manifest.json]]

## Source path
- `apps/client-mac/PrismClient/Services/ClientConfigStore.swift`

## Import references
- _No imports detected_

## Source preview
```text
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
        try data.write(to

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
