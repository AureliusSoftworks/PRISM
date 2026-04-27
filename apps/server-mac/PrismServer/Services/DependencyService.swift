import Foundation

final class DependencyService {
    func check() async -> DependencyStatus {
        async let ollama = checkHTTPDependency(
            name: "Ollama",
            command: "ollama",
            url: URL(string: "http://127.0.0.1:11434/api/tags")!
        )
        async let qdrant = checkHTTPDependency(
            name: "Qdrant",
            command: "qdrant",
            url: URL(string: "http://127.0.0.1:6333/readyz")!
        )
        return await DependencyStatus(ollama: ollama, qdrant: qdrant)
    }

    private func checkHTTPDependency(name: String, command: String, url: URL) async -> DependencyCheck {
        let installed = isCommandAvailable(command)
        let reachable = await isReachable(url: url)

        let detail: String
        if reachable {
            detail = "\(name) is reachable."
        } else if installed {
            detail = "\(name) is installed but not reachable. Start it, then refresh."
        } else {
            detail = "\(name) is not installed or not on PATH."
        }

        return DependencyCheck(
            name: name,
            isInstalled: installed,
            isReachable: reachable,
            detail: detail
        )
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

    private func isReachable(url: URL) async -> Bool {
        var request = URLRequest(url: url)
        request.timeoutInterval = 2

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return false
            }
            return (200..<500).contains(http.statusCode)
        } catch {
            return false
        }
    }
}
