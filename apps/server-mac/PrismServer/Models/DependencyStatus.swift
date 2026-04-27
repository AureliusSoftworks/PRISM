import Foundation

struct DependencyStatus: Equatable {
    var serverRuntime: PillarStatus
    var memoryEngine: PillarStatus
    var localAI: LocalAIPillarStatus

    static let unknown = DependencyStatus(
        serverRuntime: PillarStatus(
            name: "Server Runtime",
            isReady: false,
            detail: "Not checked yet."
        ),
        memoryEngine: PillarStatus(
            name: "Memory Engine",
            isReady: false,
            detail: "Not checked yet."
        ),
        localAI: LocalAIPillarStatus(
            ollama: PillarStatus(
                name: "Local AI Engine",
                isReady: false,
                detail: "Not checked yet."
            ),
            defaultModel: ModelSubstatus(
                name: "Default model",
                isReady: false,
                detail: "Not checked yet."
            )
        )
    )

    /// Ollama is not a hard gate for running the local Node services; the Memory Engine (Qdrant) is.
    var canStartNodeRuntime: Bool {
        memoryEngine.isReady
    }
}

struct PillarStatus: Equatable, Identifiable {
    var id: String { name }
    let name: String
    let isReady: Bool
    let detail: String

    var systemImage: String {
        isReady ? "checkmark.circle" : "exclamationmark.triangle"
    }
}

struct LocalAIPillarStatus: Equatable {
    var ollama: PillarStatus
    var defaultModel: ModelSubstatus
}

struct ModelSubstatus: Equatable {
    let name: String
    let isReady: Bool
    let detail: String
}
