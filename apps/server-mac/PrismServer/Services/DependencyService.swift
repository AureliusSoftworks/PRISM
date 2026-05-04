import Foundation

/// Checks product-facing readiness: Memory Engine (Qdrant), then Local AI (Ollama + default model).
final class DependencyService {
    private struct TagsResponse: Decodable {
        var models: [ModelEntry]
    }
    private struct ModelEntry: Decodable {
        var name: String
    }

    func check(config: ServerConfig, resolution: QdrantResolution) async -> DependencyStatus {
        let ollamaBase = OllamaURL.normalizeBase(config.ollamaHost)
        let (tags, ollamaReachable) = await requestOllamaModelNames(ollamaBase: ollamaBase)
        let local = localAIPillar(
            config: config,
            ollamaHost: ollamaBase,
            tags: tags,
            ollamaReachable: ollamaReachable
        )
        let mem = await memoryPillar(resolution: resolution)
        let server = PillarStatus(
            name: "Server Runtime",
            isReady: mem.isReady,
            detail: mem.isReady
                ? "The local API, discovery, and pairing surface are ready to start."
                : "The Memory Engine must be available before the server can run."
        )
        return DependencyStatus(
            serverRuntime: server,
            memoryEngine: mem,
            localAI: local
        )
    }

    private func memoryPillar(resolution: QdrantResolution) async -> PillarStatus {
        switch resolution.ownership {
        case .externalUserManaged:
            let ok = await isReadyzReachable(base: resolution.effectiveQdrantURL)
            return PillarStatus(
                name: "Memory Engine",
                isReady: ok,
                detail: ok
                    ? "Qdrant is responding at your configured URL."
                    : "Qdrant is not reachable at your configured URL. Check the service or Advanced settings."
            )
        case .managedByPrism:
            if await isReadyzReachable(base: resolution.effectiveQdrantURL) {
                return PillarStatus(
                    name: "Memory Engine",
                    isReady: true,
                    detail: "Prism-managed Qdrant is running on this Mac."
                )
            }
            if QdrantBinaryResolver.findExecutable() != nil {
                return PillarStatus(
                    name: "Memory Engine",
                    isReady: false,
                    detail: "Prism can start a local Qdrant sidecar for you on this Mac."
                )
            }
            return PillarStatus(
                name: "Memory Engine",
                isReady: false,
                detail: "Qdrant binary is missing. Build the app with a bundled `qdrant`, install Qdrant via Homebrew, or set an external Qdrant URL in Advanced."
            )
        }
    }

    private func localAIPillar(
        config: ServerConfig,
        ollamaHost: String,
        tags: [String],
        ollamaReachable: Bool
    ) -> LocalAIPillarStatus {
        let onPath = isCommandAvailable("ollama")
        let model = config.ollamaModel.trimmingCharacters(in: .whitespacesAndNewlines)
        let embeddingModel = config.ollamaEmbeddingModel.trimmingCharacters(in: .whitespacesAndNewlines)

        let ollamaDetail: String
        if ollamaReachable {
            ollamaDetail = "Ollama is responding at \(ollamaHost)."
        } else if onPath {
            ollamaDetail = "Ollama is installed but not reachable. Start it, then refresh."
        } else {
            ollamaDetail = "Ollama is not installed or not on PATH. Install it when you are ready to use local models."
        }

        return LocalAIPillarStatus(
            ollama: PillarStatus(
                name: "Local AI Engine",
                isReady: ollamaReachable,
                detail: ollamaDetail
            ),
            defaultModel: modelSubstatus(
                label: "Default model",
                model: model,
                tags: tags,
                ollamaReachable: ollamaReachable
            ),
            embeddingModel: modelSubstatus(
                label: "Embedding model",
                model: embeddingModel,
                tags: tags,
                ollamaReachable: ollamaReachable
            )
        )
    }

    private func modelSubstatus(
        label: String,
        model: String,
        tags: [String],
        ollamaReachable: Bool
    ) -> ModelSubstatus {
        let modelOk = modelPresent(in: tags, configured: model)
        let detail: String
        if model.isEmpty {
            detail = "No \(label.lowercased()) is configured."
        } else if !ollamaReachable {
            detail = "Can’t verify “\(model)” until Ollama is running."
        } else if modelOk {
            detail = "The model “\(model)” is available in Ollama."
        } else {
            detail = "Pull “\(model)” in Ollama to finish Prism setup."
        }
        return ModelSubstatus(
            name: "\(label) (\(model.isEmpty ? "—" : model))",
            isReady: modelOk && ollamaReachable,
            detail: detail
        )
    }

    private func modelPresent(in tagNames: [String], configured: String) -> Bool {
        let c = configured.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !c.isEmpty else { return false }
        for tag in tagNames {
            if tag == c { return true }
            if tag.hasPrefix(c + ":") { return true }
        }
        return false
    }

    private func requestOllamaModelNames(ollamaBase: String) async -> ([String], Bool) {
        guard let url = OllamaURL.tagsURL(ollamaBase: ollamaBase) else { return ([], false) }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<500).contains(http.statusCode) else {
                return ([], false)
            }
            let decoded = try JSONDecoder().decode(TagsResponse.self, from: data)
            return (decoded.models.map(\.name), true)
        } catch {
            return ([], false)
        }
    }

    private func isReadyzReachable(base: String) async -> Bool {
        guard let url = QdrantURL.readyzURL(forBase: base) else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }

    private func isCommandAvailable(_ command: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["which", command]
        process.standardOutput = Pipe()
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }
}
