---
title: "apps/ios-client/PrismIOS/AppModel.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/AppModel.swift"
status: "active"
---

# apps/ios-client/PrismIOS/AppModel.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphoneos/PrismIOS.build/Objects-normal/arm64/PrismIOS-OutputFileMap.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphonesimulator/PrismIOS.build/Objects-normal/arm64/PrismIOS-OutputFileMap.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphonesimulator/PrismIOS.build/Objects-normal/x86_64/PrismIOS-OutputFileMap.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/44899f667e99f80add3a26f31a78c546.xcbuilddata/manifest.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/6c73a1b7249aaef59b672a239e1967ef.xcbuilddata/manifest.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/af0ed7f090165b68ae37cee7e4161a18.xcbuilddata/manifest.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/c074fc5716d043870c341f8f040f5543.xcbuilddata/manifest.json]]

## Source path
- `apps/ios-client/PrismIOS/AppModel.swift`

## Import references
- _No imports detected_

## Source preview
```text
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
            st

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
