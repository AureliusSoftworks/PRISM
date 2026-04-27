import Foundation

final class RuntimeManager {
    var onStateChange: ((RuntimeState) -> Void)?

    private let configStore: ConfigStore
    private var apiProcess: Process?
    private var webProcess: Process?
    private var apiLogHandle: FileHandle?
    private var webLogHandle: FileHandle?

    init(configStore: ConfigStore) {
        self.configStore = configStore
    }

    func start(config: ServerConfig) throws {
        guard apiProcess == nil, webProcess == nil else {
            onStateChange?(.running)
            return
        }

        try FileManager.default.createDirectory(at: configStore.logDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: configStore.applicationSupportDirectory, withIntermediateDirectories: true)

        let runtimeURL = try runtimeRoot()
        let environment = mergedEnvironment(config: config)

        apiLogHandle = try makeLogHandle(named: "api.log")
        webLogHandle = try makeLogHandle(named: "web.log")

        let api = try startNodeProcess(
            name: "API",
            runtimeURL: runtimeURL,
            entryRelativePath: "apps/api/dist/server.js",
            workingDirectoryRelativePath: ".",
            environment: environment,
            logHandle: apiLogHandle
        )

        let web = try startNodeProcess(
            name: "Web",
            runtimeURL: runtimeURL,
            entryRelativePath: "apps/web/.next/standalone/apps/web/server.js",
            workingDirectoryRelativePath: "apps/web/.next/standalone",
            environment: environment,
            logHandle: webLogHandle
        )

        apiProcess = api
        webProcess = web
        onStateChange?(.running)
    }

    func stop() {
        stop(process: webProcess)
        stop(process: apiProcess)
        webProcess = nil
        apiProcess = nil

        close(handle: webLogHandle)
        close(handle: apiLogHandle)
        webLogHandle = nil
        apiLogHandle = nil

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

    private func mergedEnvironment(config: ServerConfig) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        config.environment(applicationSupportDirectory: configStore.applicationSupportDirectory).forEach { key, value in
            environment[key] = value
        }
        return environment
    }

    private func startNodeProcess(
        name: String,
        runtimeURL: URL,
        entryRelativePath: String,
        workingDirectoryRelativePath: String,
        environment: [String: String],
        logHandle: FileHandle?
    ) throws -> Process {
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

        attachLogging(to: process, logHandle: logHandle, processName: name)
        process.terminationHandler = { [weak self] terminatedProcess in
            guard terminatedProcess.terminationStatus != 0 else { return }
            self?.onStateChange?(.failed("\(name) exited with status \(terminatedProcess.terminationStatus)."))
        }

        try process.run()
        return process
    }

    private func bundledNodeURL() -> URL? {
        guard let resourceURL = Bundle.main.resourceURL else {
            return nil
        }
        let nodeURL = resourceURL.appendingPathComponent("node/bin/node")
        return FileManager.default.isExecutableFile(atPath: nodeURL.path) ? nodeURL : nil
    }

    private func attachLogging(to process: Process, logHandle: FileHandle?, processName: String) {
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            logHandle?.write(data)
        }
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
