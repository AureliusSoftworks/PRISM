---
title: "apps/client-mac/PrismClientTests/PairingExchangeServiceTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClientTests/PairingExchangeServiceTests.swift"
status: "active"
---

# apps/client-mac/PrismClientTests/PairingExchangeServiceTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/PrismClient.build/Debug/PrismClientTests.build/Objects-normal/arm64/PrismClientTests-OutputFileMap.json]]

## Source path
- `apps/client-mac/PrismClientTests/PairingExchangeServiceTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismClient

final class PairingExchangeServiceTests: XCTestCase {
    func testNormalizesServerURL() throws {
        XCTAssertEqual(
            try PairingExchangeService.normalizedServerURL("127.0.0.1:18787/").absoluteString,
            "http://127.0.0.1:18787"
        )
        XCTAssertEqual(
            try PairingExchangeService.normalizedServerURL("0.0.0.0:18787").absoluteString,
            "http://127.0.0.1:18787"
        )
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
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
