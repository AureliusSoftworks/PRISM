---
title: "apps/ios-client/PrismIOSTests/PairingExchangeServiceTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOSTests/PairingExchangeServiceTests.swift"
status: "active"
---

# apps/ios-client/PrismIOSTests/PairingExchangeServiceTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphonesimulator/PrismIOSTests.build/Objects-normal/arm64/PrismIOSTests-OutputFileMap.json]]

## Source path
- `apps/ios-client/PrismIOSTests/PairingExchangeServiceTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismIOS

final class PairingExchangeServiceTests: XCTestCase {
    func testNormalizesServerURL() throws {
        XCTAssertEqual(
            try PairingExchangeService.normalizedServerURL("127.0.0.1:18787/").absoluteString,
            "http://127.0.0.1:18787"
        )
    }

    func testRejectsBindAllServerURL() {
        XCTAssertThrowsError(try PairingExchangeService.normalizedServerURL("0.0.0.0:18787")) { error in
            XCTAssertTrue(error.localizedDescription.contains("Mac's LAN address"))
        }
    }

    func testNormalizesPairingCode() throws {
        XCTAssertEqual(
            try PairingExchangeService.normalizedPairingCode("abcd efgh-jklm"),
            "ABCD-EFGH-JKLM"
        )
    }

    func testRejectsShortPairingCode() {
        XCTAssertThrowsError(try PairingExchangeService.normalizedPairingCode("ABCD"))
    }

    func testFormatsDiscoveredServerURL() {
        XCTAssertEqual(
            ServerDiscoveryService.serverURL(hostName: "Prism-Server.local.", port: 18787),
            "http://Prism-Server.local:18787"
        )
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
