---
title: "apps/client-mac/PrismClientTests/ClientConfigStoreTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClientTests/ClientConfigStoreTests.swift"
status: "active"
---

# apps/client-mac/PrismClientTests/ClientConfigStoreTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/PrismClient.build/Debug/PrismClientTests.build/Objects-normal/arm64/PrismClientTests-OutputFileMap.json]]

## Source path
- `apps/client-mac/PrismClientTests/ClientConfigStoreTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismClient

final class ClientConfigStoreTests: XCTestCase {
    func testSaveLoadAndClearPairedServer() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = ClientConfigStore(applicationSupportDirectory: directory)
        let server = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            token: "session-token",
            clientAccessToken: "client-access-token",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        try store.save(server)
        XCTAssertEqual(store.loadPairedServer(), server)

        try store.clearPairedServer()
        XCTAssertNil(store.loadPairedServer())
    }

    func testMapsDefaultApiPortToWebAppURL() throws {
        let server = PairedServer(
            serverURL: "http://127.0.0.1:18787",
            token: "session-token",
            clientAccessToken: "client-access-token",
            expiresAt: Date(timeIntervalSince1970: 1_767_225_900),
            displayName: "Prism Owner"
        )

        XCTAssertEqual(server.webAppURL?.absoluteString, "http://127.0.0.1:18788/")
    }

    func testMapsLegacyApiPortToLegacyWebAppURL() throws {
        let server = PairedServer(
            serverURL: "http://127.0.

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
