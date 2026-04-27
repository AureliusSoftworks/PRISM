import SwiftUI

struct MenuBarContentView: View {
    @Environment(\.openWindow) private var openWindow
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            Divider()

            dependencySection

            Divider()

            Button("Open Dashboard") {
                model.openDashboard()
            }
            .disabled(!model.runtimeState.isRunning)

            HStack {
                Button(model.runtimeState.isRunning ? "Restart Server" : "Start Server") {
                    model.runtimeState.isRunning ? model.restart() : model.start()
                }

                Button("Stop") {
                    model.stop()
                }
                .disabled(!model.runtimeState.isRunning)
            }

            HStack {
                Button("Setup...") {
                    model.showSetupWindow()
                }

                Button("Logs...") {
                    openWindow(id: AppWindow.logs.rawValue)
                }
            }

            Divider()

            Button("Quit Prism Server") {
                model.quit()
            }
        }
        .padding()
        .frame(width: 320)
        .task {
            await model.refreshDependencies()
            if !model.dependencyStatus.canStartServer {
                model.showSetupWindow()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.config.serverName)
                .font(.headline)
            Label(model.statusText, systemImage: model.menuBarSystemImage)
                .foregroundStyle(model.runtimeState.isRunning ? .green : .secondary)
        }
    }

    private var dependencySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Dependencies")
                .font(.subheadline)
                .fontWeight(.semibold)

            DependencyRow(check: model.dependencyStatus.ollama)
            DependencyRow(check: model.dependencyStatus.qdrant)

            Button("Refresh Dependencies") {
                Task {
                    await model.refreshDependencies()
                }
            }
        }
    }
}

private struct DependencyRow: View {
    let check: DependencyCheck

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(check.name, systemImage: check.systemImage)
                .foregroundStyle(check.isReachable ? .green : .orange)
            Text(check.detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
