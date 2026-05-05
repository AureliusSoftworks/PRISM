---
title: "apps/client-mac/PrismClient/Views/PairingView.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClient/Views/PairingView.swift"
status: "active"
---

# apps/client-mac/PrismClient/Views/PairingView.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/PrismClient.build/Debug/PrismClient.build/Objects-normal/arm64/PrismClient-OutputFileMap.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/0a8fe3e451170847a2385a8ed5362452.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/1c28f9c887f9894a78651475a7b63114.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/60e558427db1bdac77015dc094c7f897.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/b6b5bf691b1edaf107c5d0547f4c5a85.xcbuilddata/manifest.json]]

## Source path
- `apps/client-mac/PrismClient/Views/PairingView.swift`

## Import references
- _No imports detected_

## Source preview
```text
import SwiftUI

struct PairingView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if let paired = model.pairedServer {
                pairedKiosk(paired)
            } else {
                pairingForm
            }
        }
        .frame(minWidth: 720, minHeight: 560)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Prism")
                .font(.largeTitle.weight(.semibold))
            Text("Pair this app with your Prism Server.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var pairingForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            Text("Enter the code shown in Prism Server.app.")
                .font(.headline)

            TextField("Server address", text: $model.serverURL)
                .textFieldStyle(.roundedBorder)

            TextField("Pairing code", text: $model.pairingCode)
                .textFieldStyle(.roundedBorder)
                .font(.system(.title3, design: .monospaced))

            Button(model.isPairing ? "Pairing..." : "Pair with Server") {
                model.pair()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(model.isPairing)

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
