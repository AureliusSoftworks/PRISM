---
title: "apps/ios-client/PrismIOS/Services/SessionStore.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/Services/SessionStore.swift"
status: "active"
---

# apps/ios-client/PrismIOS/Services/SessionStore.swift

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
- `apps/ios-client/PrismIOS/Services/SessionStore.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

final class SessionStore {
    private let metadataURL: URL
    private let tokenStore: TokenStoring
    private let clientAccessTokenStore: TokenStoring

    init(
        fileManager: FileManager = .default,
        applicationSupportDirectory: URL? = nil,
        tokenStore: TokenStoring = KeychainTokenStore(),
        clientAccessTokenStore: TokenStoring = KeychainTokenStore(account: "client-access")
    ) {
        let root = applicationSupportDirectory ?? fileManager
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!
            .appendingPathComponent("PrismIOS", isDirectory: true)
        self.metadataURL = root.appendingPathComponent("paired-server.json")
        self.tokenStore = tokenStore
        self.clientAccessTokenStore = clientAccessTokenStore
    }

    func loadSession() -> PairedSession? {
        guard
            let data = try? Data(contentsOf: metadataURL),
            let token = tokenStore.loadToken(),
            let clientAccessToken = clientAccessTokenStore.loadToken()
        else {
            return nil
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let server = try? decoder.decode(PairedServer.self, from: data) else {
            return nil
        }
        return PairedSession(server: server, token: token, clientAccessTok

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
