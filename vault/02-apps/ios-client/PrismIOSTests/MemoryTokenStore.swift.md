---
title: "apps/ios-client/PrismIOSTests/MemoryTokenStore.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOSTests/MemoryTokenStore.swift"
status: "active"
---

# apps/ios-client/PrismIOSTests/MemoryTokenStore.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphonesimulator/PrismIOSTests.build/Objects-normal/arm64/PrismIOSTests-OutputFileMap.json]]

## Source path
- `apps/ios-client/PrismIOSTests/MemoryTokenStore.swift`

## Import references
- _No imports detected_

## Source preview
```text
@testable import PrismIOS

final class MemoryTokenStore: TokenStoring {
    private var token: String?

    func loadToken() -> String? {
        token
    }

    func saveToken(_ token: String) throws {
        self.token = token
    }

    func clearToken() throws {
        token = nil
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
