---
title: "apps/server-mac/PrismServerTests/PairingCodeServiceTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServerTests/PairingCodeServiceTests.swift"
status: "active"
---

# apps/server-mac/PrismServerTests/PairingCodeServiceTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServerTests.build/Objects-normal/arm64/PrismServerTests-OutputFileMap.json]]

## Source path
- `apps/server-mac/PrismServerTests/PairingCodeServiceTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismServer

final class PairingCodeServiceTests: XCTestCase {
    func testDisplayPairingCodeStoresCodeAndExpiry() throws {
        let date = Date(timeIntervalSince1970: 1_767_225_900)
        let code = DisplayPairingCode(code: "ABCD-EFGH-JKLM", expiresAt: date)

        XCTAssertEqual(code.code, "ABCD-EFGH-JKLM")
        XCTAssertFalse(code.expirationSummary.isEmpty)
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
