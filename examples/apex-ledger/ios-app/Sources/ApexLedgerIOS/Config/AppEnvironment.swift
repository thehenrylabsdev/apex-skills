import Foundation

public enum AppEnvironment: String, CaseIterable, Sendable, Codable {
    case local = "LOCAL"
    case dev = "DEV"
    case prod = "PROD"

    public static let clientSupportedContractVersion = "2026-10-25"

    public var baseUrl: String {
        switch self {
        case .local:
            return "http://localhost:8080/api/v1"
        case .dev:
            return "https://dev-api.apexledger.internal/api/v1"
        case .prod:
            return "https://api.apexledger.io/api/v1"
        }
    }

    public var requestTimeoutSeconds: TimeInterval {
        switch self {
        case .local:
            return 15.0
        case .dev:
            return 10.0
        case .prod:
            return 5.0
        }
    }

    public var enforceTlsPinning: Bool {
        self == .prod
    }
}
