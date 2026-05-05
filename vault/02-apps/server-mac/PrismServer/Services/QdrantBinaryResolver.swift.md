---
title: "apps/server-mac/PrismServer/Services/QdrantBinaryResolver.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/QdrantBinaryResolver.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/QdrantBinaryResolver.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServer.build/Objects-normal/arm64/PrismServer-OutputFileMap.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/15d942463412e871a6f6db3384db769c.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/93131244019e5baedc52f075830d2734.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/bce97c8af3125aa1bdfa2b4cd95ca3ca.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/c39f50e08ee72329e41a44a60a47f21d.xcbuilddata/manifest.json]]

## Source path
- `apps/server-mac/PrismServer/Services/QdrantBinaryResolver.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

/// Resolves a usable Qdrant server binary (bundle first, then Homebrew/PATH) without starting a process.
enum QdrantBinaryResolver {
    static func findExecutable() -> URL? {
        if let r = Bundle.main.resourceURL {
            let bundled = r.appendingPathComponent("qdrant")
            if FileManager.default.isExecutableFile(atPath: bundled.path) {
                return bundled
            }
        }
        return which("qdrant")
    }

    private static func which(_ name: String) -> URL? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        p.arguments = [name]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do {
            try p.run()
            p.waitUntilExit()
            guard p.terminationStatus == 0 else { return nil }
            let data = out.fileHandleForReading.readDataToEndOfFile()
            guard var path = String(data: data, encoding: .utf8) else { return nil }
            path = path.trimmingCharacters(in: .whitespacesAndNewlines)
            let url = URL(fileURLWithPath: path)
            return FileManager.default.isExecutableFile(atPath: url.path) ? url : nil
        } catch {
            return nil
        }
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
