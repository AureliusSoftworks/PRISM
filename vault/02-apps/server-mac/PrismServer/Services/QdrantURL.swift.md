---
title: "apps/server-mac/PrismServer/Services/QdrantURL.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/QdrantURL.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/QdrantURL.swift

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
- `apps/server-mac/PrismServer/Services/QdrantURL.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

/// Normalizes a Qdrant base URL the same way `@localai/config` does: scheme, bind-all fix, no trailing slash.
enum QdrantURL {
    static let defaultManagedBase = "http://127.0.0.1:6333"

    static func normalize(_ raw: String) -> String {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return Self.defaultManagedBase
        }
        if !trimmed.lowercased().hasPrefix("http://") && !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "http://\(trimmed)"
        }
        // Match TypeScript: `0.0.0.0` is not a valid client target on macOS; use loopback.
        trimmed = trimmed.replacingOccurrences(
            of: "//0.0.0.0",
            with: "//127.0.0.1",
            options: .caseInsensitive
        )
        while trimmed.hasSuffix("/") {
            trimmed = String(trimmed.dropLast())
        }
        if URL(string: trimmed) != nil {
            return trimmed
        }
        return Self.defaultManagedBase
    }

    static func baseEqualsDefault(_ a: String, _ b: String) -> Bool {
        normalize(a) == normalize(b)
    }

    static func readyzURL(forBase base: String) -> URL? {
        let b = normalize(base)
        if b.hasSuffix("/readyz") {
            return URL(string: b)
        }
        if let u = URL(string: b) {
            return u.appendingPathCo

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
