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
            return u.appendingPathComponent("readyz")
        }
        return nil
    }
}
