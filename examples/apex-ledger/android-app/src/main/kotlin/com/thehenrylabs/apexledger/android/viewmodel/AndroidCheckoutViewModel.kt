package com.thehenrylabs.apexledger.android.viewmodel

import com.thehenrylabs.apexledger.android.navigation.ApexNavKey
import com.thehenrylabs.apexledger.android.navigation.Navigation3BackStack
import com.thehenrylabs.apexledger.shared.config.AppEnvironment
import com.thehenrylabs.apexledger.shared.model.OrderSnapshot
import com.thehenrylabs.apexledger.shared.model.ProblemDetails
import com.thehenrylabs.apexledger.shared.statechart.CheckoutEvent
import com.thehenrylabs.apexledger.shared.statechart.CheckoutStatechart
import com.thehenrylabs.apexledger.shared.statechart.CheckoutUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Android ViewModel bridging Kotlin Multiplatform (`shared-kmp`) Statechart
 * with Jetpack Navigation 3 routes and multi-flavor environments (`LOCAL`, `DEV`, `PROD`).
 */
class AndroidCheckoutViewModel(
    initialEnvironment: AppEnvironment = AppEnvironment.LOCAL
) {
    private val _uiState = MutableStateFlow(CheckoutUiState(environment = initialEnvironment))
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    val backStack = Navigation3BackStack()

    fun dispatch(event: CheckoutEvent) {
        val next = CheckoutStatechart.reduce(_uiState.value, event)
        _uiState.value = next

        when (event) {
            is CheckoutEvent.ReservationSucceeded -> {
                backStack.navigateTo(
                    ApexNavKey.FlashCheckoutRoute(
                        campaignId = event.snapshot.campaignId,
                        skuCode = event.snapshot.skuCode
                    )
                )
            }
            is CheckoutEvent.OrderConfirmedAndSettled -> {
                val txId = event.snapshot.settlementReceipt?.transactionId ?: "TXN-PENDING"
                backStack.navigateTo(
                    ApexNavKey.LedgerReceiptRoute(
                        orderId = event.snapshot.orderId,
                        transactionId = txId
                    )
                )
            }
            is CheckoutEvent.ResetFlow, is CheckoutEvent.SwitchEnvironment -> {
                backStack.resetToRoot()
            }
            else -> Unit
        }
    }

    fun onReserveSuccess(snapshot: OrderSnapshot) {
        dispatch(CheckoutEvent.ReservationSucceeded(snapshot))
    }

    fun onReserveOutOfStock(problem: ProblemDetails) {
        dispatch(CheckoutEvent.ReservationRejectedOutOfStock(problem))
    }

    fun onSettleSuccess(snapshot: OrderSnapshot) {
        dispatch(CheckoutEvent.OrderConfirmedAndSettled(snapshot))
    }
}
