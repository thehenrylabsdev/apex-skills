import Foundation

public struct IosCheckoutState: Sendable, Equatable {
    public var environment: AppEnvironment
    public var phase: CheckoutPhase
    public var activeIdempotencyKey: String?
    public var activeOrder: OrderSnapshot?
    public var lastProblem: ProblemDetails?
    public var contractUpgradeRecommended: Bool

    public init(
        environment: AppEnvironment = .local,
        phase: CheckoutPhase = .idle,
        activeIdempotencyKey: String? = nil,
        activeOrder: OrderSnapshot? = nil,
        lastProblem: ProblemDetails? = nil,
        contractUpgradeRecommended: Bool = false
    ) {
        self.environment = environment
        self.phase = phase
        self.activeIdempotencyKey = activeIdempotencyKey
        self.activeOrder = activeOrder
        self.lastProblem = lastProblem
        self.contractUpgradeRecommended = contractUpgradeRecommended
    }
}

public enum IosCheckoutEvent: Sendable {
    case switchEnvironment(AppEnvironment)
    case submitReservation(idempotencyKey: String)
    case reservationSucceeded(OrderSnapshot)
    case reservationRejectedOutOfStock(ProblemDetails)
    case authorizePayment(idempotencyKey: String)
    case orderConfirmedAndSettled(OrderSnapshot)
    case resetFlow
}

public enum IosCheckoutStatechart {
    public static func reduce(state: IosCheckoutState, event: IosCheckoutEvent) -> IosCheckoutState {
        var next = state
        switch event {
        case .switchEnvironment(let env):
            next.environment = env
            next.phase = .idle
            next.activeOrder = nil
            next.activeIdempotencyKey = nil
            next.lastProblem = nil
            return next

        case .submitReservation(let key):
            next.phase = .reserving
            next.activeIdempotencyKey = key
            next.lastProblem = nil
            return next

        case .reservationSucceeded(let snapshot):
            next.phase = .reserved
            next.activeOrder = snapshot
            next.contractUpgradeRecommended = snapshot.isBackendContractNewerThanClient
            return next

        case .reservationRejectedOutOfStock(let problem):
            next.phase = .rejectedOutOfStock
            next.lastProblem = problem
            return next

        case .authorizePayment(let key):
            next.phase = .paymentProcessing
            next.activeIdempotencyKey = key
            return next

        case .orderConfirmedAndSettled(let snapshot):
            next.phase = .settled
            next.activeOrder = snapshot
            next.contractUpgradeRecommended = snapshot.isBackendContractNewerThanClient
            return next

        case .resetFlow:
            next.phase = .idle
            next.activeOrder = nil
            next.activeIdempotencyKey = nil
            next.lastProblem = nil
            return next
        }
    }
}
