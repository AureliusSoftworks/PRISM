---
title: "apps/ios-client/PrismIOS/Views/PairingView.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/Views/PairingView.swift"
status: "active"
---

# apps/ios-client/PrismIOS/Views/PairingView.swift

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
- `apps/ios-client/PrismIOS/Views/PairingView.swift`

## Import references
- _No imports detected_

## Source preview
```text
import SwiftUI

struct PairingView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Connect to Prism Server")
                            .font(.title2.bold())
                        Text("Prism looks for your server on this Wi-Fi network. Enter the short code shown in Prism Server.app.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }

                Section("Server") {
                    if let server = model.discoveredServers.first {
                        LabeledContent("Found", value: server.name)
                        LabeledContent("Address", value: server.url)
                    } else {
                        Text(model.isDiscoveringServer ? "Searching local network..." : "No Prism Server found yet.")
                            .foregroundStyle(.secondary)
                    }

                    DisclosureGroup("Manual address") {
                        TextField("http://192.168.1.20:18787", text: $model.serverURL)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .autocorrectionD

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
