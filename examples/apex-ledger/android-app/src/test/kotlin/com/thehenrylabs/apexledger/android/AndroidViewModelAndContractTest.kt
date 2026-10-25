package com.thehenrylabs.apexledger.android

import com.thehenrylabs.apexledger.android.navigation.ApexNavKey
import com.thehenrylabs.apexledger.android.ui.ApexComposeDesignSpec
import com.thehenrylabs.apexledger.android.viewmodel.AndroidCheckoutViewModel
import com.thehenrylabs.apexledger.shared.config.AppEnvironment
import com.thehenrylabs.apexledger.shared.model.ApexContractJson
import com.thehenrylabs.apexledger.shared.model.CheckoutPhase
import com.thehenrylabs.apexledger.shared.model.OrderSnapshot
import com.thehenrylabs.apexledger.shared.statechart.CheckoutEvent
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AndroidViewModelAndContractTest {

    private val contractsDir: Path = Path.of("../contracts")

    @Test
    fun verifiesAndroidViewModelNavigation3AndSharedKmpForwardCompatibility() {
        val viewModel = AndroidCheckoutViewModel(initialEnvironment = AppEnvironment.LOCAL)
        assertEquals(ApexNavKey.CampaignFeedRoute, viewModel.backStack.currentRoute)
        assertEquals(48, ApexComposeDesignSpec.MIN_TOUCH_TARGET_DP)

        // Switch to DEV environment
        viewModel.dispatch(CheckoutEvent.SwitchEnvironment(AppEnvironment.DEV))
        assertEquals(AppEnvironment.DEV, viewModel.uiState.value.environment)
        assertEquals(
            "https://dev-api.apexledger.internal/api/v1",
            viewModel.uiState.value.environment.androidEmulatorBaseUrl
        )

        // Submit Reservation
        viewModel.dispatch(
            CheckoutEvent.SubmitReservation(
                campaignId = "11111111-1111-4111-8111-111111111101",
                idempotencyKey = "33333333-3333-4333-8333-333333333301"
            )
        )
        assertEquals(CheckoutPhase.RESERVING, viewModel.uiState.value.phase)

        // Receive v1 Reservation Created payload from Backend
        val reservedJson = Files.readString(contractsDir.resolve("reservation-created.json"))
        val reservedSnapshot = ApexContractJson.decodeFromString<OrderSnapshot>(reservedJson)
        viewModel.onReserveSuccess(reservedSnapshot)
        assertEquals(CheckoutPhase.RESERVED, viewModel.uiState.value.phase)
        assertTrue(viewModel.backStack.currentRoute is ApexNavKey.FlashCheckoutRoute)

        // Receive v2 Forward-Compatible Settled payload from upgraded Backend
        val v2SettledJson = Files.readString(contractsDir.resolve("forward-compatible-v2-order.json"))
        val v2SettledSnapshot = ApexContractJson.decodeFromString<OrderSnapshot>(v2SettledJson)
        viewModel.dispatch(CheckoutEvent.AuthorizePayment("44444444-4444-4444-8444-444444444499"))
        viewModel.onSettleSuccess(v2SettledSnapshot)

        assertEquals(CheckoutPhase.SETTLED, viewModel.uiState.value.phase)
        assertTrue(viewModel.uiState.value.contractUpgradeRecommended)
        assertTrue(viewModel.backStack.currentRoute is ApexNavKey.LedgerReceiptRoute)

        val a11ySummary = ApexComposeDesignSpec.buildScreenAccessibilitySummary(viewModel.uiState.value)
        assertEquals("WindowInsets.safeDrawing", a11ySummary["windowInsets"])
        assertEquals("Icons.Outlined.Verified", a11ySummary["vectorIconName"])
    }
}
