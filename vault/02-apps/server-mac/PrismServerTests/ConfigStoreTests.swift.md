---
title: "apps/server-mac/PrismServerTests/ConfigStoreTests.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServerTests/ConfigStoreTests.swift"
status: "active"
---

# apps/server-mac/PrismServerTests/ConfigStoreTests.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServerTests.build/Objects-normal/arm64/PrismServerTests-OutputFileMap.json]]

## Source path
- `apps/server-mac/PrismServerTests/ConfigStoreTests.swift`

## Import references
- _No imports detected_

## Source preview
```text
import XCTest
@testable import PrismServer

final class ConfigStoreTests: XCTestCase {
    func testParseEnvSkipsCommentsAndBlankLines() {
        let env = ConfigStore.parseEnv(
            """
            # Prism Server
            API_PORT=18787

            PRISM_SERVER_NAME=Kitchen Mac
            """
        )

        XCTAssertEqual(env["API_PORT"], "18787")
        XCTAssertEqual(env["PRISM_SERVER_NAME"], "Kitchen Mac")
        XCTAssertNil(env["# Prism Server"])
    }

    func testServerEnvironmentBindsWebSurfaceToLan() {
        let supportURL = URL(fileURLWithPath: "/tmp/prism-test-support", isDirectory: true)
        let env = ServerConfig.defaults.environment(applicationSupportDirectory: supportURL)

        XCTAssertEqual(env["HOSTNAME"], "0.0.0.0")
        XCTAssertEqual(env["LOCALAI_API_ORIGIN"], "http://127.0.0.1:18787")
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
