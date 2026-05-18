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
            ),
            embeddingModel: ModelSubstatus(
                name: "Embedding model",
                isReady: false,
                detail: "Not checked yet."
            ),
            canAutoInstallOllama: false,
            ollamaInstallHint: nil
        )
    )

    /// Prism's app plumbing requires the local chat and embedding models to be present.
    var canStartNodeRuntime: Bool {
        memoryEngine.isReady && localAI.isReady
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
    var embeddingModel: ModelSubstatus
    var canAutoInstallOllama: Bool
    var ollamaInstallHint: String?

    var isReady: Bool {
        ollama.isReady && defaultModel.isReady && embeddingModel.isReady
    }
}

struct ModelSubstatus: Equatable {
    let name: String
    let isReady: Bool
    let detail: String
}
