import Foundation

public enum CheckoutPhase: String, Codable, Sendable, Equatable {
    case idle = "IDLE"
    case reserving = "RESERVING"
    case reserved = "RESERVED"
    case paymentProcessing = "PAYMENT_PROCESSING"
    case confirmed = "CONFIRMED"
    case settled = "SETTLED"
    case rejectedOutOfStock = "REJECTED_OUT_OF_STOCK"
    case expired = "EXPIRED"
    case cancelled = "CANCELLED"
}

public struct CampaignListResponse: Codable, Sendable, Equatable {
    public let contractVersion: String
    public let environment: String
    public let campaigns: [FlashCampaign]
}

public struct FlashCampaign: Codable, Sendable, Equatable, Identifiable {
    public let campaignId: String
    public let skuCode: String
    public let title: String
    public let subtitle: String
    public let unitPriceCents: Int
    public let currency: String
    public let initialAllocation: Int
    public let remainingStock: Int
    public let reservedStock: Int
    public let settledStock: Int
    public let status: String

    public var id: String { campaignId }

    public var isInventoryConserved: Bool {
        (remainingStock + reservedStock + settledStock == initialAllocation) && remainingStock >= 0
    }
}

public struct SettlementReceipt: Codable, Sendable, Equatable {
    public let transactionId: String
    public let debitAccountCode: String
    public let creditAccountCode: String
    public let debitAmountCents: Int
    public let creditAmountCents: Int
    public let zeroSumVerified: Bool
    public let settledAtIso: String

    public var isBalancedDoubleEntry: Bool {
        zeroSumVerified && (debitAmountCents - creditAmountCents == 0) && debitAmountCents > 0
    }
}

public struct OrderSnapshot: Codable, Sendable, Equatable {
    public let orderId: String
    public let campaignId: String
    public let skuCode: String
    public let buyerId: String
    public let quantity: Int
    public let totalAmountCents: Int
    public let currency: String
    public let status: CheckoutPhase
    public let idempotencyKey: String
    public let idempotentReplay: Bool
    public let expiresAtEpochMs: Int64
    public let contractVersion: String
    public let settlementReceipt: SettlementReceipt?

    public var isBackendContractNewerThanClient: Bool {
        contractVersion > AppEnvironment.clientSupportedContractVersion
    }
}

public struct LedgerPostingEntry: Codable, Sendable, Equatable, Identifiable {
    public let entryId: String
    public let orderId: String
    public let transactionId: String
    public let direction: String
    public let accountCode: String
    public let amountCents: Int
    public let createdAtIso: String

    public var id: String { entryId }
}

public struct LedgerSummary: Codable, Sendable, Equatable {
    public let contractVersion: String
    public let environment: String
    public let totalDebitCents: Int
    public let totalCreditCents: Int
    public let netBalanceCents: Int
    public let zeroSumInvariantHold: Bool
    public let settledOrdersCount: Int
    public let entries: [LedgerPostingEntry]
}

public struct ProblemDetails: Codable, Sendable, Equatable {
    public let type: String
    public let title: String
    public let status: Int
    public let detail: String
    public let errorCode: String
    public let traceId: String
}
