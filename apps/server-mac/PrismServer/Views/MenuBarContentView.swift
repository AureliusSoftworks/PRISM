import SwiftUI

struct MenuBarContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            Divider()

            readinessSection

            Divider()

            HStack {
                Button(model.runtimeState.isRunning ? "Restart Server" : "Start Server") {
                    if model.runtimeState.isRunning {
                        model.restart()
                    } else {
                        model.start()
                    }
                }
                .disabled(!model.dependencyStatus.canStartNodeRuntime && !model.runtimeState.isRunning)

                Button("Stop") {
                    model.stop()
                }
                .disabled(!model.runtimeState.isRunning)
            }

            HStack {
                Button("Setup…") {
                    model.showSetupWindow()
                }

                Button("Logs…") {
                    model.showLogsWindow()
                }
            }

            Divider()

            Button("Quit Prism Server") {
                model.quit()
            }
        }
        .padding()
        .frame(width: 340)
        .task {
            await model.refreshDependencies()
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

    private var readinessSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Readiness")
                .font(.subheadline)
                .fontWeight(.semibold)

            ReadinessPillarView(status: model.dependencyStatus.serverRuntime)
            ReadinessPillarView(status: model.dependencyStatus.memoryEngine)
            ReadinessPillarView(status: model.dependencyStatus.localAI.ollama)
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: model.dependencyStatus.localAI.defaultModel.isReady ? "checkmark.circle" : "exclamationmark.triangle")
                    .foregroundStyle(model.dependencyStatus.localAI.defaultModel.isReady ? .green : .orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.dependencyStatus.localAI.defaultModel.name)
                        .font(.subheadline)
                    Text(model.dependencyStatus.localAI.defaultModel.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Button("Refresh") {
                Task { await model.refreshDependencies() }
            }
        }
    }
}

private struct ReadinessPillarView: View {
    let status: PillarStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(status.name, systemImage: status.systemImage)
                .foregroundStyle(status.isReady ? .green : .orange)
            Text(status.detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
