import AppKit
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var config: ServerConfig
    @Published var dependencyStatus = DependencyStatus.unknown
    @Published var runtimeState: RuntimeState = .stopped

    let configStore: ConfigStore
    let dependencyService: DependencyService
    let logTailer: LogTailer

    private let runtimeManager: RuntimeManager
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
            return "Starting..."
        case .failed(let message):
            return "Stopped: \(message)"
        case .stopped:
            return "Stopped"
        }
    }

    var dashboardURL: URL {
        URL(string: "http://127.0.0.1:\(config.webPort)")!
    }

    func startIfReady() async {
        guard dependencyStatus.canStartServer else {
            runtimeState = .failed("Install or start Ollama and Qdrant first.")
            return
        }
        start()
    }

    func start() {
        do {
            runtimeState = .starting
            try configStore.save(config)
            try runtimeManager.start(config: config)
        } catch {
            runtimeState = .failed(error.localizedDescription)
        }
    }

    func stop() {
        runtimeManager.stop()
    }

    func restart() {
        runtimeManager.stop()
        start()
    }

    func openDashboard() {
        NSWorkspace.shared.open(dashboardURL)
    }

    func showSetupWindow() {
        if setupWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 520, height: 460),
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
        dependencyStatus = await dependencyService.check()
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
