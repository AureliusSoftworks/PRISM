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
