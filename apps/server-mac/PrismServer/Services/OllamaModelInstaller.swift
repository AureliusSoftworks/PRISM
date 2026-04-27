import Foundation

/// Runs user-approved Ollama model downloads using fixed Process arguments, never shell strings.
final class OllamaModelInstaller {
    private let configStore: ConfigStore

    init(configStore: ConfigStore) {
        self.configStore = configStore
    }

    func pull(model rawModel: String) async throws {
        let model = try Self.validatedModelName(rawModel)
        try FileManager.default.createDirectory(at: configStore.logDirectory, withIntermediateDirectories: true)

        let logHandle = try makeLogHandle()
        defer {
            try? logHandle.close()
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["ollama", "pull", model]
        process.standardOutput = makeLogPipe(handle: logHandle)
        process.standardError = makeLogPipe(handle: logHandle)

        try await runAndWait(process)
    }

    static func validatedModelName(_ raw: String) throws -> String {
        let model = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !model.isEmpty else {
            throw OllamaModelInstallerError.invalidModelName("Choose a model before downloading.")
        }

        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/._-")
        guard model.unicodeScalars.allSatisfy({ allowed.contains($0) }) else {
            throw OllamaModelInstallerError.invalidModelName("Model names can contain letters, numbers, colon, slash, dot, underscore, and hyphen.")
        }
        return model
    }

    private func runAndWait(_ process: Process) async throws {
        try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { terminated in
                if terminated.terminationStatus == 0 {
                    continuation.resume()
                } else {
                    continuation.resume(
                        throwing: OllamaModelInstallerError.pullFailed(
                            "Ollama model download failed with status \(terminated.terminationStatus). See ollama-model.log for details."
                        )
                    )
                }
            }
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    private func makeLogHandle() throws -> FileHandle {
        let url = configStore.logDirectory.appendingPathComponent("ollama-model.log")
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: url)
        try handle.seekToEnd()
        try handle.write(contentsOf: "\n--- Ollama model download \(Date()) ---\n".data(using: .utf8) ?? Data())
        return handle
    }

    private func makeLogPipe(handle: FileHandle) -> Pipe {
        let pipe = Pipe()
        pipe.fileHandleForReading.readabilityHandler = { h in
            let data = h.availableData
            guard !data.isEmpty else { return }
            try? handle.write(contentsOf: data)
        }
        return pipe
    }
}

enum OllamaModelInstallerError: LocalizedError {
    case invalidModelName(String)
    case pullFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidModelName(let message), .pullFailed(let message):
            return message
        }
    }
}
