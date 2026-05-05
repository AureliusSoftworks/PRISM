---
title: "apps/server-mac/PrismServerTests/QdrantURLTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServerTests/QdrantURLTests.swift"
status: "active"
---

# apps/server-mac/PrismServerTests/QdrantURLTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServerTests.build/Objects-normal/arm64/PrismServerTests-OutputFileMap.json]]

## Source path
- `apps/server-mac/PrismServerTests/QdrantURLTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismServer

final class QdrantURLTests: XCTestCase {
    func testNormalizesNoSchemeAndBindAll() {
        XCTAssertEqual(
            QdrantURL.normalize("0.0.0.0:6333"),
            "http://127.0.0.1:6333"
        )
        XCTAssertEqual(
            QdrantURL.normalize("http://127.0.0.1:6333/"),
            "http://127.0.0.1:6333"
        )
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
