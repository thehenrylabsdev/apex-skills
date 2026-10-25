package com.thehenrylabs.apexledger.shared.model

import com.thehenrylabs.apexledger.shared.config.AppEnvironment
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Forward-compatible JSON codec for Mobile (Android & iOS).
 * - ignoreUnknownKeys = true ensures Backend additive v2 fields never crash older mobile builds.
 * - coerceInputValues = true safely falls back on unexpected nulls or defaultable enums.
 */
val ApexContractJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
    isLenient = false
}

@Serializable
enum class CheckoutPhase {
    IDLE,
    RESERVING,
    RESERVED,
    PAYMENT_PROCESSING,
    CONFIRMED,
    SETTLED,
    REJECTED_OUT_OF_STOCK,
    EXPIRED,
    CANCELLED
}

@Serializable
data class CampaignListResponse(
    val contractVersion: String = AppEnvironment.CLIENT_SUPPORTED_CONTRACT_VERSION,
    val environment: String = "LOCAL",
    val campaigns: List<FlashCampaign> = emptyList()
)

@Serializable
data class FlashCampaign(
    val campaignId: String,
    val skuCode: String,
    val title: String,
    val subtitle: String,
    val unitPriceCents: Long,
    val currency: String = "USD",
    val initialAllocation: Int,
    val remainingStock: Int,
    val reservedStock: Int = 0,
    val settledStock: Int = 0,
    val status: String = "ACTIVE"
) {
    val isInventoryConserved: Boolean
        get() = (remainingStock + reservedStock + settledStock == initialAllocation) && remainingStock >= 0
}

@Serializable
data class SettlementReceipt(
    val transactionId: String,
    val debitAccountCode: String,
    val creditAccountCode: String,
    val debitAmountCents: Long,
    val creditAmountCents: Long,
    val zeroSumVerified: Boolean,
    val settledAtIso: String
) {
    val isBalancedDoubleEntry: Boolean
        get() = zeroSumVerified && (debitAmountCents - creditAmountCents == 0L) && debitAmountCents > 0L
}

@Serializable
data class OrderSnapshot(
    val orderId: String,
    val campaignId: String,
    val skuCode: String,
    val buyerId: String,
    val quantity: Int,
    val totalAmountCents: Long,
    val currency: String = "USD",
    val status: CheckoutPhase = CheckoutPhase.IDLE,
    val idempotencyKey: String,
    val idempotentReplay: Boolean = false,
    val expiresAtEpochMs: Long = 0L,
    val contractVersion: String = AppEnvironment.CLIENT_SUPPORTED_CONTRACT_VERSION,
    val settlementReceipt: SettlementReceipt? = null
) {
    val isBackendContractNewerThanClient: Boolean
        get() = contractVersion > AppEnvironment.CLIENT_SUPPORTED_CONTRACT_VERSION
}

@Serializable
data class LedgerPostingEntry(
    val entryId: String,
    val orderId: String,
    val transactionId: String,
    val direction: String,
    val accountCode: String,
    val amountCents: Long,
    val createdAtIso: String
)

@Serializable
data class LedgerSummary(
    val contractVersion: String = AppEnvironment.CLIENT_SUPPORTED_CONTRACT_VERSION,
    val environment: String = "LOCAL",
    val totalDebitCents: Long,
    val totalCreditCents: Long,
    val netBalanceCents: Long,
    val zeroSumInvariantHold: Boolean,
    val settledOrdersCount: Int,
    val entries: List<LedgerPostingEntry> = emptyList()
)

@Serializable
data class ProblemDetails(
    val type: String,
    val title: String,
    val status: Int,
    val detail: String,
    val errorCode: String,
    val traceId: String
)
