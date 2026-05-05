---
title: "apps/ios-client/PrismIOS/Services/ServerDiscoveryService.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/Services/ServerDiscoveryService.swift"
status: "active"
---

# apps/ios-client/PrismIOS/Services/ServerDiscoveryService.swift

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
- `apps/ios-client/PrismIOS/Services/ServerDiscoveryService.swift`

## Import references
- _No imports detected_

## Source preview
```text
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
            servers.append(

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
