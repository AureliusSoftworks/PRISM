---
title: "apps/client-mac/PrismClient/AppModel.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClient/AppModel.swift"
status: "active"
---

# apps/client-mac/PrismClient/AppModel.swift

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
- `apps/client-mac/PrismClient/AppModel.swift`

## Import references
- _No imports detected_

## Source preview
```text
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

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
