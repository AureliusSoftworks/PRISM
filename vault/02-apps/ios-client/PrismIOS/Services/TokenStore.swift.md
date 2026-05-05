---
title: "apps/ios-client/PrismIOS/Services/TokenStore.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/ios-client/PrismIOS/Services/TokenStore.swift"
status: "active"
---

# apps/ios-client/PrismIOS/Services/TokenStore.swift

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
- `apps/ios-client/PrismIOS/Services/TokenStore.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation
import Security

protocol TokenStoring {
    func loadToken() -> String?
    func saveToken(_ token: String) throws
    func clearToken() throws
}

final class KeychainTokenStore: TokenStoring {
    private let service = "com.localai.prism-ios"
    private let account: String

    init(account: String = "paired-session") {
        self.account = account
    }

    func loadToken() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    func saveToken(_ token: String) throws {
        try clearToken()
        var item = baseQuery()
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainTokenStoreError.unhandledStatus(status)
        }
    }

    func clearToken() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
