---
title: "apps/ios-client/PrismIOS/Models/PairedServer.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/Models/PairedServer.swift"
status: "active"
---

# apps/ios-client/PrismIOS/Models/PairedServer.swift

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
- `apps/ios-client/PrismIOS/Models/PairedServer.swift`

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
    let expiresAt: Date
    let displayName: String

    var expirationSummary: String {
        expiresAt.formatted(date: .abbreviated, time: .shortened)
    }

    var webAppURL: URL? {
        guard var components = URLComponents(string: serverURL) else {
            return nil
        }
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

struct PairedSession: Equatable {
    let server: PairedServer
    let token: String
    let clientAccessToken: String
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
