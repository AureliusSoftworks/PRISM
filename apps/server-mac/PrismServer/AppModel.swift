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
            && !dependencyStatus.localAI.defaultModel.isReady
            && !config.ollamaModel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !isDownloadingModel
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
            await startNodeStack()
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

    private func startNodeStack() async {
        do {
            let resolution = await resolveQdrantForRuntime()
            qdrantResolution = resolution

            if resolution.ownership == .managedByPrism {
                try await runtimeManager.startMemoryEngine(resolution: resolution)
            }

            dependencyStatus = await dependencyService.check(config: config, resolution: resolution)

            guard dependencyStatus.canStartNodeRuntime else {
                runtimeState = .failed("The Memory Engine (Qdrant) is not ready yet.")
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
        let model = config.ollamaModel.trimmingCharacters(in: .whitespacesAndNewlines)
        isDownloadingModel = true
        setupMessage = "Downloading \(model)…"
        Task {
            defer { isDownloadingModel = false }
            do {
                try await ollamaModelInstaller.pull(model: model)
                setupMessage = "\(model) is ready."
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
