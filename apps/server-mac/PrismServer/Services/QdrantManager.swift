import Darwin
import Foundation

/// Runs a Prism-owned Qdrant sidecar; never used when `QdrantOwnership` is `externalUserManaged`.
final class QdrantManager: @unchecked Sendable {
    private let configStore: ConfigStore
    private var process: Process?
    /// True only if this manager spawned the current sidecar in this app session.
    private var weStartedChild = false
    private var logHandle: FileHandle?
    private let startQueue = DispatchQueue(label: "com.localai.qdrant-manager")

    init(configStore: ConfigStore) {
        self.configStore = configStore
    }

    /// Stops a managed sidecar that we started (no-op for external or when nothing is running).
    func stop() {
        startQueue.sync {
            self.stopProcessLocked()
        }
    }

    private func stopProcessLocked() {
        guard weStartedChild, let running = process, running.isRunning else {
            process = nil
            weStartedChild = false
            return
        }
        weStartedChild = false
        self.process = nil

        running.terminate()
        let deadline = Date().addingTimeInterval(5)
        while running.isRunning, Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if running.isRunning {
            _ = kill(running.processIdentifier, SIGKILL)
        }
        closeLogLocked()
    }

    private func closeLogLocked() {
        do { try logHandle?.close() } catch { }
        logHandle = nil
    }

    /// Starts a managed Qdrant when ownership is `managedByPrism`. Throws on port conflict, missing binary, or readiness timeout.
    func startIfNeeded(resolution: QdrantResolution) async throws {
        guard resolution.ownership == .managedByPrism else { return }
        let alreadyStartedByPrism = startQueue.sync {
            weStartedChild && (process?.isRunning ?? false)
        }
        if alreadyStartedByPrism {
            return
        }
        if await Self.isReadyzUp(base: resolution.effectiveQdrantURL) {
            throw QdrantSidecarError.portInUse(
                "Qdrant is already responding on port 6333. Stop the other process or set a custom Qdrant URL in Advanced."
            )
        }
        let binary = try findBinary()
        let storageDir = configStore.applicationSupportDirectory
            .appendingPathComponent("Qdrant", isDirectory: true)
            .appendingPathComponent("storage", isDirectory: true)
        try FileManager.default.createDirectory(at: storageDir, withIntermediateDirectories: true)

        try startQueue.sync {
            try self.startProcessLocked(binary: binary, storagePath: storageDir.path)
        }
        let ready = await waitForReady(resolution: resolution, timeout: 60)
        if !ready {
            startQueue.sync { self.stopProcessLocked() }
            throw QdrantSidecarError.readinessTimeout("Qdrant did not become ready in time. See qdrant.log for details.")
        }
    }

    #if DEBUG
    /// Exposed for unit tests: whether this session launched a Qdrant child.
    var didStartManagedChildForTests: Bool {
        startQueue.sync { weStartedChild }
    }
    #endif

    private static func isReadyzUp(base: String) async -> Bool {
        guard let url = QdrantURL.readyzURL(forBase: base) else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 1.2
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return http.statusCode == 200
        } catch {
            return false
        }
    }

    private func startProcessLocked(binary: URL, storagePath: String) throws {
        if weStartedChild, (process?.isRunning ?? false) { return }
        stopProcessLocked()

        let logURL = configStore.logDirectory.appendingPathComponent("qdrant.log")
        if !FileManager.default.fileExists(atPath: logURL.path) {
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: logURL)
        try handle.seekToEnd()
        let stamp = "\n--- Prism Qdrant launch \(Date()) ---\n"
        if let d = stamp.data(using: .utf8) {
            try handle.write(contentsOf: d)
        }
        logHandle = handle

        let p = Process()
        p.executableURL = binary
        p.arguments = []
        var environment = ProcessInfo.processInfo.environment
        environment["QDRANT__STORAGE__STORAGE_PATH"] = storagePath
        environment["QDRANT__SERVICE__HTTP_PORT"] = "6333"
        environment["QDRANT__SERVICE__GRPC_PORT"] = "6334"
        p.environment = environment
        p.currentDirectoryURL = configStore.applicationSupportDirectory.appendingPathComponent("Qdrant", isDirectory: true)
        p.standardOutput = makeLogPipe(handle: handle)
        p.standardError = makeLogPipe(handle: handle)

        try p.run()
        process = p
        weStartedChild = true
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

    private func waitForReady(resolution: QdrantResolution, timeout: TimeInterval) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await Self.isReadyzUp(base: resolution.effectiveQdrantURL) {
                return true
            }
            let stillStarting = startQueue.sync {
                guard weStartedChild, let p = self.process else { return false }
                return p.isRunning
            }
            if !stillStarting {
                return false
            }
            try? await Task.sleep(nanoseconds: 200_000_000) // 200ms
        }
        return false
    }

    private func findBinary() throws -> URL {
        if let u = QdrantBinaryResolver.findExecutable() { return u }
        throw QdrantSidecarError.missingBinary(
            "Qdrant binary is missing. Add `qdrant` to the app bundle, install Qdrant on this Mac, or set an external Qdrant URL in Advanced."
        )
    }
}

enum QdrantSidecarError: LocalizedError {
    case portInUse(String)
    case missingBinary(String)
    case readinessTimeout(String)

    var errorDescription: String? {
        switch self {
        case .portInUse(let message), .missingBinary(let message), .readinessTimeout(let message):
            return message
        }
    }
}
