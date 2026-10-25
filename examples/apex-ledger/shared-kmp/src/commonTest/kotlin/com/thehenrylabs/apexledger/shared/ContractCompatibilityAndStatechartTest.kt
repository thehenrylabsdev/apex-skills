package com.thehenrylabs.apexledger.shared

import com.thehenrylabs.apexledger.shared.config.AppEnvironment
import com.thehenrylabs.apexledger.shared.model.ApexContractJson
import com.thehenrylabs.apexledger.shared.model.CampaignListResponse
import com.thehenrylabs.apexledger.shared.model.CheckoutPhase
import com.thehenrylabs.apexledger.shared.model.LedgerSummary
import com.thehenrylabs.apexledger.shared.model.OrderSnapshot
import com.thehenrylabs.apexledger.shared.model.ProblemDetails
import com.thehenrylabs.apexledger.shared.statechart.CheckoutEvent
import com.thehenrylabs.apexledger.shared.statechart.CheckoutStatechart
import com.thehenrylabs.apexledger.shared.statechart.CheckoutUiState
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ContractCompatibilityAndStatechartTest {

    private val contractsDir: Path = Path.of("../contracts")

    @Test
    fun verifiesAllCanonicalWireContractsDeserializeCleanlyOnMobileKmp() {
        val campaignsJson = Files.readString(contractsDir.resolve("campaigns-response.json"))
        val campaignsResponse = ApexContractJson.decodeFromString<CampaignListResponse>(campaignsJson)
        assertEquals("2026-10-25", campaignsResponse.contractVersion)
        assertEquals(3, campaignsResponse.campaigns.size)
        assertTrue(campaignsResponse.campaigns.all { it.isInventoryConserved })

        val reservationJson = Files.readString(contractsDir.resolve("reservation-created.json"))
        val reservedOrder = ApexContractJson.decodeFromString<OrderSnapshot>(reservationJson)
        assertEquals(CheckoutPhase.RESERVED, reservedOrder.status)
        assertFalse(reservedOrder.isBackendContractNewerThanClient)

        val settledJson = Files.readString(contractsDir.resolve("order-confirmed-settled.json"))
        val settledOrder = ApexContractJson.decodeFromString<OrderSnapshot>(settledJson)
        assertEquals(CheckoutPhase.SETTLED, settledOrder.status)
        assertNotNull(settledOrder.settlementReceipt)
        assertTrue(settledOrder.settlementReceipt.isBalancedDoubleEntry)

        val ledgerJson = Files.readString(contractsDir.resolve("ledger-summary.json"))
        val ledgerSummary = ApexContractJson.decodeFromString<LedgerSummary>(ledgerJson)
        assertTrue(ledgerSummary.zeroSumInvariantHold)
        assertEquals(0L, ledgerSummary.netBalanceCents)
        assertEquals(2, ledgerSummary.entries.size)

        val problemJson = Files.readString(contractsDir.resolve("problem-out-of-stock.json"))
        val problem = ApexContractJson.decodeFromString<ProblemDetails>(problemJson)
        assertEquals(409, problem.status)
        assertEquals("PROBLEM_OUT_OF_STOCK", problem.errorCode)
    }

    @Test
    fun verifiesForwardCompatibilityWhenBackendEvolvesToV2WithoutMobileUpdate() {
        val v2Json = Files.readString(contractsDir.resolve("forward-compatible-v2-order.json"))
        val v2Snapshot = ApexContractJson.decodeFromString<OrderSnapshot>(v2Json)

        assertEquals(CheckoutPhase.SETTLED, v2Snapshot.status)
        assertEquals("2027-03-01", v2Snapshot.contractVersion)
        assertTrue(v2Snapshot.isBackendContractNewerThanClient)
        assertNotNull(v2Snapshot.settlementReceipt)
        assertTrue(v2Snapshot.settlementReceipt.isBalancedDoubleEntry)

        var uiState = CheckoutUiState(environment = AppEnvironment.PROD)
        uiState = CheckoutStatechart.reduce(
            uiState,
            CheckoutEvent.SubmitReservation(v2Snapshot.campaignId, v2Snapshot.idempotencyKey)
        )
        uiState = CheckoutStatechart.reduce(uiState, CheckoutEvent.ReservationSucceeded(v2Snapshot))
        assertEquals(CheckoutPhase.RESERVED, uiState.phase)
        assertTrue(uiState.contractUpgradeRecommended)
    }

    @Test
    fun verifiesThreeEnvironmentsAndCompleteStatechartTransitions() {
        assertEquals(AppEnvironment.LOCAL, AppEnvironment.fromCode("local"))
        assertEquals(AppEnvironment.DEV, AppEnvironment.fromCode("DEV"))
        assertEquals(AppEnvironment.PROD, AppEnvironment.fromCode("prod"))
        assertTrue(AppEnvironment.PROD.enforceTlsPinning)
        assertFalse(AppEnvironment.PROD.enableBurstSimulator)

        val settledJson = Files.readString(contractsDir.resolve("order-confirmed-settled.json"))
        val settledSnapshot = ApexContractJson.decodeFromString<OrderSnapshot>(settledJson)
        val problemJson = Files.readString(contractsDir.resolve("problem-out-of-stock.json"))
        val outOfStockProblem = ApexContractJson.decodeFromString<ProblemDetails>(problemJson)

        var state = CheckoutUiState()
        state = CheckoutStatechart.reduce(state, CheckoutEvent.SwitchEnvironment(AppEnvironment.DEV))
        assertEquals(AppEnvironment.DEV, state.environment)

        state = CheckoutStatechart.reduce(
            state,
            CheckoutEvent.SubmitReservation("camp-1", "idem-reserve-1")
        )
        assertEquals(CheckoutPhase.RESERVING, state.phase)

        // Test 409 Out of Stock branch
        val rejectedState = CheckoutStatechart.reduce(
            state,
            CheckoutEvent.ReservationRejectedOutOfStock(outOfStockProblem)
        )
        assertEquals(CheckoutPhase.REJECTED_OUT_OF_STOCK, rejectedState.phase)

        // Test Happy Path: RESERVING -> RESERVED -> PAYMENT_PROCESSING -> RETRY -> SETTLED -> RESET
        state = CheckoutStatechart.reduce(state, CheckoutEvent.ReservationSucceeded(settledSnapshot))
        assertEquals(CheckoutPhase.RESERVED, state.phase)

        state = CheckoutStatechart.reduce(state, CheckoutEvent.AuthorizePayment("idem-pay-1"))
        assertEquals(CheckoutPhase.PAYMENT_PROCESSING, state.phase)

        state = CheckoutStatechart.reduce(state, CheckoutEvent.PaymentFailedRetryable("Transient timeout"))
        assertEquals(CheckoutPhase.RESERVED, state.phase)

        state = CheckoutStatechart.reduce(state, CheckoutEvent.AuthorizePayment("idem-pay-1"))
        state = CheckoutStatechart.reduce(state, CheckoutEvent.OrderConfirmedAndSettled(settledSnapshot))
        assertEquals(CheckoutPhase.SETTLED, state.phase)

        state = CheckoutStatechart.reduce(state, CheckoutEvent.ResetFlow)
        assertEquals(CheckoutPhase.IDLE, state.phase)
    }
}
