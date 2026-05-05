---
title: "apps/ios-client/PrismIOSTests/SessionStoreTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOSTests/SessionStoreTests.swift"
status: "active"
---

# apps/ios-client/PrismIOSTests/SessionStoreTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphonesimulator/PrismIOSTests.build/Objects-normal/arm64/PrismIOSTests-OutputFileMap.json]]

## Source path
- `apps/ios-client/PrismIOSTests/SessionStoreTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismIOS

final class SessionStoreTests: XCTestCase {
    func testSaveLoadAndClearSession() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = SessionStore(
            applicationSupportDirectory: directory,
            tokenStore: MemoryTokenStore(),
            clientAccessTokenStore: MemoryTokenStore()
        )
        let session = PairedSession(
            server: PairedServer(
                serverURL: "http://127.0.0.1:18787",
                expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
                displayName: "Prism Owner"
            ),
            token: "session-token",
            clientAccessToken: "client-access-token"
        )

        try store.save(session)
        XCTAssertEqual(store.loadSession(), session)

        try store.clearSession()
        XCTAssertNil(store.loadSession())
    }

    func testMapsApiPortToWebAppURL() throws {
        let server = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        XCTAssertEqual(server.webAppURL?.absoluteString, "http://127.0.0.1:18788/")
    }

    func testMapsLegacyApiPortToLegacyWebAppURL() throws {
        let serv

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
