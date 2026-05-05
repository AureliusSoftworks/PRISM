---
title: "apps/client-mac/PrismClient/Models/PairedServer.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClient/Models/PairedServer.swift"
status: "active"
---

# apps/client-mac/PrismClient/Models/PairedServer.swift

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
- `apps/client-mac/PrismClient/Models/PairedServer.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

struct PairedServer: Codable, Equatable {
    private static let defaultAPIPort = 18_787
    private static let defaultWebPort = 18_788
    private static let legacyAPIPort = 8787
    private static let legacyWebPort = 3000

    let serverURL: String
    let token: String
    let clientAccessToken: String?
    let expiresAt: Date
    let displayName: String

    var expirationSummary: String {
        expiresAt.formatted(date: .abbreviated, time: .shortened)
    }

    var webAppURL: URL? {
        guard var components = URLComponents(string: serverURL) else {
            return nil
        }
        // Pairing happens against the API port. The reusable Prism interface is
        // served by the paired server's web process on the matching web port.
        if components.port == Self.defaultAPIPort {
            components.port = Self.defaultWebPort
        } else if components.port == Self.legacyAPIPort {
            components.port = Self.legacyWebPort
        }
        components.path = "/"
        components.queryItems = nil
        return components.url
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
