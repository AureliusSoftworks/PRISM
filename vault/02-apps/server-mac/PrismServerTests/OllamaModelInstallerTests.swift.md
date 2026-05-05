---
title: "apps/server-mac/PrismServerTests/OllamaModelInstallerTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServerTests/OllamaModelInstallerTests.swift"
status: "active"
---

# apps/server-mac/PrismServerTests/OllamaModelInstallerTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServerTests.build/Objects-normal/arm64/PrismServerTests-OutputFileMap.json]]

## Source path
- `apps/server-mac/PrismServerTests/OllamaModelInstallerTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismServer

final class OllamaModelInstallerTests: XCTestCase {
    func testValidatedModelNameAcceptsCommonOllamaNames() throws {
        XCTAssertEqual(try OllamaModelInstaller.validatedModelName(" llama3.2:latest "), "llama3.2:latest")
        XCTAssertEqual(try OllamaModelInstaller.validatedModelName("library/qwen2.5-coder"), "library/qwen2.5-coder")
    }

    func testValidatedModelNameRejectsEmptyOrShellLikeInput() {
        XCTAssertThrowsError(try OllamaModelInstaller.validatedModelName("   "))
        XCTAssertThrowsError(try OllamaModelInstaller.validatedModelName("llama3.2; rm -rf /"))
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
