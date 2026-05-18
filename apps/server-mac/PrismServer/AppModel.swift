import AppKit
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var config: ServerConfig
    @Published var qdrantResolution: QdrantResolution?
    @Published var dependencyStatus = DependencyStatus.unknown
    @Published var runtimeState: RuntimeState = .stopped
    @Published var setupMessage: String?
    @Published var isStartingMemoryEngine = false
    @Published var isDownloadingModel = false
    @Published var isInstallingOllama = false
    @Published var pairingCode: DisplayPairingCode?
    @Published var isGeneratingPairingCode = false

    let configStore: ConfigStore
    let dependencyService: DependencyService
    let logTailer: LogTailer

    private let runtimeManager: RuntimeManager
    private let ollamaModelInstaller: OllamaModelInstaller
    private let pairingCodeService = PairingCodeService()
    private var setupWindow: NSWindow?
    private var logsWindow: NSWindow?
    private var notificationObservers: [NSObjectProtocol] = []
    private var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    init() {
        let configStore = ConfigStore()
        self.configStore = configStore
        self.config = configStore.load()
        self.logTailer = LogTailer(logDirectory: configStore.logDirectory)
        self.dependencyService = DependencyService()
        self.runtimeManager = RuntimeManager(configStore: configStore)
        self.ollamaModelInstaller = OllamaModelInstaller(configStore: configStore)

        self.runtimeManager.onStateChange = { [weak self] state in
            Task { @MainActor in
                self?.runtimeState = state
            }
        }

        if !isRunningTests {
            notificationObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .showPrismServerWindow,
                    object: nil,
                    queue: .main
                ) { [weak self] _ in
                    Task { @MainActor in
                        self?.showSetupWindow()
                    }
                }
            )
            notificationObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .prismServerWillTerminate,
                    object: nil,
                    queue: .main
                ) { [weak self] _ in
                    self?.stop()
                }
            )
            Task {
                await refreshDependencies()
                showSetupWindow()
                await startIfReady()
            }
        }
    }

    var menuBarSystemImage: String {
        switch runtimeState {
        case .running:
            return "server.rack"
        case .starting:
            return "clock.arrow.circlepath"
        case .failed:
            return "exclamationmark.triangle"
        case .stopped:
            return "power"
        }
    }

    var statusText: String {
        switch runtimeState {
        case .running:
            return "Running"
        case .starting:
            return "Starting…"
        case .failed(let message):
            return "Stopped: \(message)"
        case .stopped:
            return "Stopped"
        }
    }

    var dashboardURL: URL {
        URL(string: "http://127.0.0.1:\(config.webPort)")!
    }

    var canStartManagedMemoryEngine: Bool {
        qdrantResolution?.ownership == .managedByPrism
            && !dependencyStatus.memoryEngine.isReady
            && !isStartingMemoryEngine
    }

    var canDownloadDefaultModel: Bool {
        dependencyStatus.localAI.ollama.isReady
            && !missingRequiredModelNames.isEmpty
            && !isDownloadingModel
    }

    var canInstallOllama: Bool {
        dependencyStatus.localAI.canAutoInstallOllama
            && !dependencyStatus.localAI.ollama.isReady
            && !isInstallingOllama
    }

    var requiredModelDownloadLabel: String {
        let missing = missingRequiredModelNames
        guard !missing.isEmpty else { return "Required Models" }
        if missing.count == 1 {
            return missing[0]
        }
        return "\(missing.count) Required Models"
    }

    private var missingRequiredModelNames: [String] {
        var models: [String] = []
        if !dependencyStatus.localAI.defaultModel.isReady {
            models.append(config.ollamaModel)
        }
        if !dependencyStatus.localAI.embeddingModel.isReady {
            models.append(config.ollamaEmbeddingModel)
        }
        var seen = Set<String>()
        return models
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { seen.insert($0).inserted }
    }

    /// Auto-start on launch when the Memory Engine is already satisfied; otherwise stay stopped without surfacing a failure.
    func startIfReady() async {
        if dependencyStatus.canStartNodeRuntime {
            await startNodeStack()
        }
    }

    func setUpPrismTapped() {
        setupMessage = "Preparing Prism…"
        Task {
            await runManagedSetupAndStart()
            if case .failed(let message) = runtimeState {
                setupMessage = message
            }
        }
    }

    func start() {
        setupMessage = "Preparing Prism…"
        Task {
            await startNodeStack()
        }
    }

    func installOllamaTapped() {
        guard canInstallOllama else { return }
        isInstallingOllama = true
        setupMessage = "Installing Ollama with Homebrew…"
        Task {
            defer { isInstallingOllama = false }
            do {
                try await installOllamaWithHomebrew()
                setupMessage = "Ollama installed. Starting Ollama…"
                _ = try? await launchOllamaApp()
                try? await waitForOllamaReachable(timeoutSeconds: 12)
                await refreshDependencies()
                if dependencyStatus.localAI.ollama.isReady {
                    setupMessage = "Ollama is ready."
                } else {
                    setupMessage = "Ollama installed. Open Ollama once, then refresh status."
                }
            } catch {
                runtimeState = .failed(error.localizedDescription)
                setupMessage = error.localizedDescription
            }
        }
    }

    private func startNodeStack() async {
        do {
            let resolution = await resolveQdrantForRuntime()
            qdrantResolution = resolution

            if resolution.ownership == .managedByPrism {
                try await runtimeManager.startMemoryEngine(resolution: resolution)
            }

            dependencyStatus = await dependencyService.check(config: config, resolution: resolution)

            guard dependencyStatus.canStartNodeRuntime else {
                runtimeState = .failed("The Memory Engine and required local models must be ready before Prism can run.")
                return
            }

            runtimeState = .starting
            try configStore.save(config)
            try await runtimeManager.start(config: config, resolution: resolution)
            setupMessage = "Prism Server is running. Pairing from the client app is the next step."
        } catch {
            runtimeState = .failed(error.localizedDescription)
        }
    }

    private func runManagedSetupAndStart() async {
        do {
            let resolution = await resolveQdrantForRuntime()
            qdrantResolution = resolution

            if resolution.ownership == .managedByPrism {
                setupMessage = "Starting Memory Engine…"
                try await runtimeManager.startMemoryEngine(resolution: resolution)
            }

            dependencyStatus = await dependencyService.check(config: config, resolution: resolution)

            if !dependencyStatus.localAI.ollama.isReady && dependencyStatus.localAI.canAutoInstallOllama {
                isInstallingOllama = true
                defer { isInstallingOllama = false }
                setupMessage = "Installing Ollama with Homebrew…"
                try await installOllamaWithHomebrew()
                _ = try? await launchOllamaApp()
                try? await waitForOllamaReachable(timeoutSeconds: 12)
                dependencyStatus = await dependencyService.check(config: config, resolution: resolution)
            }

            if dependencyStatus.localAI.ollama.isReady && !missingRequiredModelNames.isEmpty {
                let models = missingRequiredModelNames
                isDownloadingModel = true
                defer { isDownloadingModel = false }
                for model in models {
                    setupMessage = "Downloading \(model)…"
                    try await ollamaModelInstaller.pull(model: model)
                }
                dependencyStatus = await dependencyService.check(config: config, resolution: resolution)
            }
        } catch {
            runtimeState = .failed(error.localizedDescription)
            setupMessage = error.localizedDescription
            return
        }

        await startNodeStack()
    }

    private func installOllamaWithHomebrew() async throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["brew", "install", "--cask", "ollama"]
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        try await runAndWait(process, failedMessage: "Ollama install failed. Check Homebrew and try again.")
    }

    private func launchOllamaApp() async throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", "Ollama"]
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        try await runAndWait(process, failedMessage: "Ollama was installed, but Prism could not open it automatically.")
    }

    private func waitForOllamaReachable(timeoutSeconds: Int) async throws {
        let deadline = Date().addingTimeInterval(Double(timeoutSeconds))
        while Date() < deadline {
            try Task.checkCancellation()
            let resolution = await resolveQdrantForRuntime()
            let status = await dependencyService.check(config: config, resolution: resolution)
            if status.localAI.ollama.isReady {
                dependencyStatus = status
                return
            }
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
    }

    private func runAndWait(_ process: Process, failedMessage: String) async throws {
        try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { terminated in
                if terminated.terminationStatus == 0 {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: NSError(domain: "PrismServer", code: Int(terminated.terminationStatus), userInfo: [
                        NSLocalizedDescriptionKey: failedMessage
                    ]))
                }
            }
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    func startMemoryEngineTapped() {
        guard !isStartingMemoryEngine else { return }
        isStartingMemoryEngine = true
        setupMessage = "Starting Memory Engine…"
        Task {
            defer { isStartingMemoryEngine = false }
            do {
                let resolution = await resolveQdrantForRuntime()
                qdrantResolution = resolution
                try await runtimeManager.startMemoryEngine(resolution: resolution)
                dependencyStatus = await dependencyService.check(config: config, resolution: resolution)
                setupMessage = "Memory Engine is running."
            } catch {
                runtimeState = .failed(error.localizedDescription)
                setupMessage = error.localizedDescription
            }
        }
    }

    func downloadDefaultModelTapped() {
        guard !isDownloadingModel else { return }
        let models = missingRequiredModelNames
        guard !models.isEmpty else { return }
        isDownloadingModel = true
        setupMessage = models.count == 1
            ? "Downloading \(models[0])…"
            : "Downloading \(models.count) required models…"
        Task {
            defer { isDownloadingModel = false }
            do {
                for model in models {
                    setupMessage = "Downloading \(model)…"
                    try await ollamaModelInstaller.pull(model: model)
                }
                setupMessage = models.count == 1
                    ? "\(models[0]) is ready."
                    : "Required models are ready."
                await refreshDependencies()
            } catch {
                runtimeState = .failed(error.localizedDescription)
                setupMessage = error.localizedDescription
            }
        }
    }

    func generatePairingCodeTapped() {
        guard runtimeState.isRunning, !isGeneratingPairingCode else { return }
        isGeneratingPairingCode = true
        setupMessage = "Generating pairing code…"
        Task {
            defer { isGeneratingPairingCode = false }
            do {
                pairingCode = try await pairingCodeService.createPairingCode(apiPort: config.apiPort)
                setupMessage = "Enter this code in Prism Client to pair with this server."
            } catch {
                runtimeState = .failed(error.localizedDescription)
                setupMessage = error.localizedDescription
            }
        }
    }

    func stop() {
        runtimeManager.stop()
        pairingCode = nil
    }

    func restart() {
        Task { @MainActor in
            runtimeManager.stop()
            await startNodeStack()
        }
    }

    func openDashboard() {
        NSWorkspace.shared.open(dashboardURL)
    }

    func showSetupWindow() {
        if setupWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 520, height: 540),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            window.title = "Prism Server"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(
                rootView: SetupWindowView()
                    .environmentObject(self)
            )
            window.center()
            window.setFrameAutosaveName("PrismServerSetup")
            setupWindow = window
        }

        setupWindow?.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func showLogsWindow() {
        if logsWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 800, height: 560),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            window.title = "Prism Server Logs"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(
                rootView: LogsWindowView()
                    .environmentObject(self)
            )
            window.center()
            window.setFrameAutosaveName("PrismServerLogs")
            logsWindow = window
        }

        logsWindow?.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func refreshDependencies() async {
        let resolution = await resolveQdrantForRuntime()
        qdrantResolution = resolution
        dependencyStatus = await dependencyService.check(config: config, resolution: resolution)
    }

    private func resolveQdrantForRuntime() async -> QdrantResolution {
        if let existing = qdrantResolution, existing.ownership == .managedByPrism {
            return existing
        }
        return await QdrantResolutionService.resolve(config: config)
    }

    func saveConfig() {
        do {
            try configStore.save(config)
        } catch {
            runtimeState = .failed(error.localizedDescription)
        }
    }

    func quit() {
        runtimeManager.stop()
        NSApplication.shared.terminate(nil)
    }
}
