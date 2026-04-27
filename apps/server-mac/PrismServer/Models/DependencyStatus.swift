import Foundation

struct DependencyStatus: Equatable {
    var ollama: DependencyCheck
    var qdrant: DependencyCheck

    static let unknown = DependencyStatus(
        ollama: DependencyCheck(name: "Ollama", isInstalled: false, isReachable: false, detail: "Not checked yet."),
        qdrant: DependencyCheck(name: "Qdrant", isInstalled: false, isReachable: false, detail: "Not checked yet.")
    )

    var canStartServer: Bool {
        ollama.isReachable && qdrant.isReachable
    }
}

struct DependencyCheck: Equatable, Identifiable {
    var id: String { name }
    let name: String
    let isInstalled: Bool
    let isReachable: Bool
    let detail: String

    var systemImage: String {
        isReachable ? "checkmark.circle" : "exclamationmark.triangle"
    }
}
