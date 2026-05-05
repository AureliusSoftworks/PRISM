---
title: "apps/ios-client/PrismIOS/Views/RootView.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/Views/RootView.swift"
status: "active"
---

# apps/ios-client/PrismIOS/Views/RootView.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphoneos/PrismIOS.build/Objects-normal/arm64/PrismIOS-OutputFileMap.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphonesimulator/PrismIOS.build/Objects-normal/arm64/PrismIOS-OutputFileMap.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/PrismIOS.build/Debug-iphonesimulator/PrismIOS.build/Objects-normal/x86_64/PrismIOS-OutputFileMap.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/44899f667e99f80add3a26f31a78c546.xcbuilddata/manifest.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/6c73a1b7249aaef59b672a239e1967ef.xcbuilddata/manifest.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/af0ed7f090165b68ae37cee7e4161a18.xcbuilddata/manifest.json]]
- [[02-apps/ios-client/DerivedData/Build/Intermediates.noindex/XCBuildData/c074fc5716d043870c341f8f040f5543.xcbuilddata/manifest.json]]

## Source path
- `apps/ios-client/PrismIOS/Views/RootView.swift`

## Import references
- _No imports detected_

## Source preview
```text
import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let session = model.session {
            KioskWebView(session: session)
                .background(Color(red: 0.04, green: 0.05, blue: 0.07))
                .ignoresSafeArea(.all)
                .ignoresSafeArea(.keyboard)
        } else {
            PairingView()
        }
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
