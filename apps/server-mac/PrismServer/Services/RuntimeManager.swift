import Foundation

final class RuntimeManager {
    var onStateChange: ((RuntimeState) -> Void)?

    private let configStore: ConfigStore
    private let qdrantManager: QdrantManager
    private var apiProcess: Process?
    private var webProcess: Process?
    private var apiLogHandle: FileHandle?
    private var webLogHandle: FileHandle?
    private var apiLogPipe: Pipe?
    private var webLogPipe: Pipe?
    private let startsBundledWebDashboard = true

    init(configStore: ConfigStore) {
        self.configStore = configStore
        self.qdrantManager = QdrantManager(configStore: configStore)
    }

    func startMemoryEngine(resolution: QdrantResolution) async throws {
        try FileManager.default.createDirectory(at: configStore.logDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: configStore.applicationSupportDirectory, withIntermediateDirectories: true)
        try await qdrantManager.startIfNeeded(resolution: resolution)
    }

    func start(config: ServerConfig, resolution: QdrantResolution) async throws {
        guard apiProcess == nil, webProcess == nil else {
            onStateChange?(.running)
            return
        }

        try FileManager.default.createDirectory(at: configStore.logDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: configStore.applicationSupportDirectory, withIntermediateDirectories: true)

        try await qdrantManager.startIfNeeded(resolution: resolution)

        let runtimeURL = try runtimeRoot()
        let environment = mergedEnvironment(config: config, qdrantURL: resolution.effectiveQdrantURL)

        apiLogHandle = try makeLogHandle(named: "api.log")
        if startsBundledWebDashboard {
            webLogHandle = try makeLogHandle(named: "web.log")
        }

        let api = try startNodeProcess(
            name: "API",
            runtimeURL: runtimeURL,
            entryRelativePath: "apps/api/dist/server.js",
            workingDirectoryRelativePath: ".",
            environment: environment,
            logHandle: apiLogHandle
        )

        apiProcess = api.process
        apiLogPipe = api.logPipe
        if startsBundledWebDashboard {
            let web = try startNodeProcess(
                name: "Web",
                runtimeURL: runtimeURL,
                entryRelativePath: "apps/web/.next/standalone/apps/web/server.js",
                workingDirectoryRelativePath: "apps/web/.next/standalone",
                environment: environment,
                logHandle: webLogHandle
            )
            webProcess = web.process
            webLogPipe = web.logPipe
        }
        onStateChange?(.running)
    }

    func stop() {
        detachLogging(from: webLogPipe)
        detachLogging(from: apiLogPipe)
        webLogPipe = nil
        apiLogPipe = nil

        stop(process: webProcess)
        stop(process: apiProcess)
        webProcess = nil
        apiProcess = nil

        close(handle: webLogHandle)
        close(handle: apiLogHandle)
        webLogHandle = nil
        apiLogHandle = nil

        qdrantManager.stop()
        onStateChange?(.stopped)
    }

    private func runtimeRoot() throws -> URL {
        guard let resourceURL = Bundle.main.resourceURL else {
            throw RuntimeError.missingRuntime("Bundle resources are unavailable.")
        }
        let runtimeURL = resourceURL.appendingPathComponent("runtime", isDirectory: true)
        guard FileManager.default.fileExists(atPath: runtimeURL.path) else {
            throw RuntimeError.missingRuntime("Runtime bundle is missing. Rebuild Prism Server.app.")
        }
        return runtimeURL
    }

    private func mergedEnvironment(config: ServerConfig, qdrantURL: String) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        config.environment(applicationSupportDirectory: configStore.applicationSupportDirectory).forEach { key, value in
            environment[key] = value
        }
        environment["QDRANT_URL"] = qdrantURL
        return environment
    }

    private func startNodeProcess(
        name: String,
        runtimeURL: URL,
        entryRelativePath: String,
        workingDirectoryRelativePath: String,
        environment: [String: String],
        logHandle: FileHandle?
    ) throws -> (process: Process, logPipe: Pipe) {
        let entryURL = runtimeURL.appendingPathComponent(entryRelativePath)
        guard FileManager.default.fileExists(atPath: entryURL.path) else {
            throw RuntimeError.missingRuntime("\(name) entrypoint is missing at \(entryURL.path).")
        }

        let process = Process()
        process.currentDirectoryURL = runtimeURL.appendingPathComponent(workingDirectoryRelativePath, isDirectory: true)
        process.environment = environment

        if let bundledNode = bundledNodeURL() {
            process.executableURL = bundledNode
            process.arguments = [entryURL.path]
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", entryURL.path]
        }

        let logPipe = attachLogging(to: process, logHandle: logHandle, processName: name)
        process.terminationHandler = { [weak self] terminatedProcess in
            guard terminatedProcess.terminationStatus != 0 else { return }
            self?.onStateChange?(.failed("\(name) exited with status \(terminatedProcess.terminationStatus)."))
        }

        try process.run()
        return (process, logPipe)
    }

    private func bundledNodeURL() -> URL? {
        guard let resourceURL = Bundle.main.resourceURL else {
            return nil
        }
        let nodeURL = resourceURL.appendingPathComponent("node/bin/node")
        return FileManager.default.isExecutableFile(atPath: nodeURL.path) ? nodeURL : nil
    }

    private func attachLogging(to process: Process, logHandle: FileHandle?, processName: String) -> Pipe {
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            logHandle?.write(data)
        }
        return pipe
    }

    private func detachLogging(from pipe: Pipe?) {
        pipe?.fileHandleForReading.readabilityHandler = nil
    }

    private func makeLogHandle(named name: String) throws -> FileHandle {
        let url = configStore.logDirectory.appendingPathComponent(name)
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: url)
        try handle.seekToEnd()
        try handle.write(contentsOf: "\n--- Prism Server launch \(Date()) ---\n".data(using: .utf8) ?? Data())
        return handle
    }

    private func stop(process: Process?) {
        guard let process, process.isRunning else {
            return
        }
        process.terminate()
        DispatchQueue.global(qos: .utility).async {
            process.waitUntilExit()
        }
    }

    private func close(handle: FileHandle?) {
        do {
            try handle?.close()
        } catch {
            // Logging shutdown must not prevent the app from quitting.
        }
    }
}

enum RuntimeError: LocalizedError {
    case missingRuntime(String)

    var errorDescription: String? {
        switch self {
        case .missingRuntime(let message):
            return message
        }
    }
}
