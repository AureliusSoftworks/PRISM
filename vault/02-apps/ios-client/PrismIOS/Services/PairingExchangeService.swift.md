---
title: "apps/ios-client/PrismIOS/Services/PairingExchangeService.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/Services/PairingExchangeService.swift"
status: "active"
---

# apps/ios-client/PrismIOS/Services/PairingExchangeService.swift

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
- `apps/ios-client/PrismIOS/Services/PairingExchangeService.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

final class PairingExchangeService {
    private static let requestTimeout: TimeInterval = 8

    private struct PairingExchangeResponse: Decodable {
        struct User: Decodable {
            let displayName: String
        }

        let ok: Bool
        let token: String
        let clientAccessToken: String
        let expiresAt: String
        let user: User
    }

    private struct HealthResponse: Decodable {
        let ok: Bool
        let serverName: String
    }

    func validateServer(serverURL rawServerURL: String) async throws -> String {
        let serverURL = try Self.normalizedServerURL(rawServerURL)
        let endpoint = try Self.endpoint(base: serverURL, path: "/api/health")
        var request = URLRequest(url: endpoint)
        request.timeoutInterval = Self.requestTimeout
        let (data, response) = try await Self.send(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw PairingExchangeError.requestFailed("Prism Server did not respond to the health check.")
        }
        let decoded = try JSONDecoder().decode(HealthResponse.self, from: data)
        guard decoded.ok else {
            throw PairingExchangeError.requestFailed("Prism Server is reachable but not ready.")
        }
        return decoded.serverName
    }

    func exchange(serverURL rawServerURL: String,

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
