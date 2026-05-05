---
title: "apps/server-mac/PrismServer/Services/OllamaURL.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/OllamaURL.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/OllamaURL.swift

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
- `apps/server-mac/PrismServer/Services/OllamaURL.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

/// Aligns with `@localai/config` Ollama normalization for local client calls.
enum OllamaURL {
    static let defaultBase = "http://127.0.0.1:11434"

    static func normalizeBase(_ raw: String) -> String {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return Self.defaultBase
        }
        if !trimmed.lowercased().hasPrefix("http://") && !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "http://\(trimmed)"
        }
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
        return Self.defaultBase
    }

    static func tagsURL(ollamaBase: String) -> URL? {
        let b = normalizeBase(ollamaBase)
        return URL(string: b + "/api/tags")
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
