import Foundation

enum RuntimeState: Equatable {
    case stopped
    case starting
    case running
    case failed(String)

    var isRunning: Bool {
        if case .running = self {
            return true
        }
        return false
    }
}
