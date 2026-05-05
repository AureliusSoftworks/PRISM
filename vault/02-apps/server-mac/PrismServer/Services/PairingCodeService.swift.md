---
title: "apps/server-mac/PrismServer/Services/PairingCodeService.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/PairingCodeService.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/PairingCodeService.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServer.build/Objects-normal/arm64/PrismServer-OutputFileMap.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/15d942463412e871a6f6db3384db769c.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/93131244019e5baedc52f075830d2734.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/bce97c8af3125aa1bdfa2b4cd95ca3ca.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/c39f50e08ee72329e41a44a60a47f21d.xcbuilddata/manifest.json]]

## Source path
- `apps/server-mac/PrismServer/Services/PairingCodeService.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

struct DisplayPairingCode: Equatable {
    let code: String
    let expiresAt: Date

    var expirationSummary: String {
        expiresAt.formatted(date: .omitted, time: .shortened)
    }
}

final class PairingCodeService {
    private struct Response: Decodable {
        struct PairingCodePayload: Decodable {
            let code: String
            let expiresAt: Date
        }

        let ok: Bool
        let pairingCode: PairingCodePayload
    }

    func createPairingCode(apiPort: Int) async throws -> DisplayPairingCode {
        guard let url = URL(string: "http://127.0.0.1:\(apiPort)/api/local/pairing/codes") else {
            throw PairingCodeError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 5

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 201 else {
            throw PairingCodeError.requestFailed("Could not generate a pairing code. Make sure Prism Server is running.")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(Response.self, from: data)
        guard decoded.ok else {
            throw PairingCodeError.requestFailed("Prism Server did not accept the pairing reque

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
