---
title: "apps/client-mac/PrismClient/Services/PairingExchangeService.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClient/Services/PairingExchangeService.swift"
status: "active"
---

# apps/client-mac/PrismClient/Services/PairingExchangeService.swift

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
- `apps/client-mac/PrismClient/Services/PairingExchangeService.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

final class PairingExchangeService {
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

    func exchange(serverURL rawServerURL: String, code rawCode: String) async throws -> PairedServer {
        let serverURL = try Self.normalizedServerURL(rawServerURL)
        let code = try Self.normalizedPairingCode(rawCode)
        let endpoint = serverURL.appendingPathComponent("api/pairing/exchange")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw PairingExchangeError.requestFailed("Pairing failed. Check the server address and code, then try again.")
        }

        let decoded = try JSONDecoder().decode(PairingExchangeResponse.self, from: data)
        guard decoded.ok else {
            throw PairingExchangeError.requestF

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
