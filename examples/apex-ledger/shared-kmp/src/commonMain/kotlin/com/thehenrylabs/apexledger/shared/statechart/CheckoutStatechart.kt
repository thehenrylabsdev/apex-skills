package com.thehenrylabs.apexledger.shared.statechart

import com.thehenrylabs.apexledger.shared.config.AppEnvironment
import com.thehenrylabs.apexledger.shared.model.CheckoutPhase
import com.thehenrylabs.apexledger.shared.model.OrderSnapshot
import com.thehenrylabs.apexledger.shared.model.ProblemDetails

data class CheckoutUiState(
    val environment: AppEnvironment = AppEnvironment.LOCAL,
    val phase: CheckoutPhase = CheckoutPhase.IDLE,
    val selectedCampaignId: String? = null,
    val activeIdempotencyKey: String? = null,
    val activeOrder: OrderSnapshot? = null,
    val lastProblem: ProblemDetails? = null,
    val contractUpgradeRecommended: Boolean = false
)

sealed interface CheckoutEvent {
    data class SwitchEnvironment(val environment: AppEnvironment) : CheckoutEvent
    data class SubmitReservation(val campaignId: String, val idempotencyKey: String) : CheckoutEvent
    data class ReservationSucceeded(val snapshot: OrderSnapshot) : CheckoutEvent
    data class ReservationRejectedOutOfStock(val problem: ProblemDetails) : CheckoutEvent
    data class AuthorizePayment(val paymentIdempotencyKey: String) : CheckoutEvent
    data class PaymentFailedRetryable(val reason: String) : CheckoutEvent
    data class OrderConfirmedAndSettled(val snapshot: OrderSnapshot) : CheckoutEvent
    data class ReservationExpired(val problem: ProblemDetails) : CheckoutEvent
    data object UserCancelReservation : CheckoutEvent
    data object ResetFlow : CheckoutEvent
}

/**
 * Pure deterministic Statechart reducer shared across Android and iOS.
 */
object CheckoutStatechart {

    fun reduce(state: CheckoutUiState, event: CheckoutEvent): CheckoutUiState {
        return when (event) {
            is CheckoutEvent.SwitchEnvironment -> state.copy(
                environment = event.environment,
                phase = CheckoutPhase.IDLE,
                activeOrder = null,
                activeIdempotencyKey = null,
                lastProblem = null
            )

            is CheckoutEvent.SubmitReservation -> {
                if (state.phase != CheckoutPhase.IDLE &&
                    state.phase != CheckoutPhase.REJECTED_OUT_OF_STOCK &&
                    state.phase != CheckoutPhase.EXPIRED &&
                    state.phase != CheckoutPhase.CANCELLED
                ) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.RESERVING,
                        selectedCampaignId = event.campaignId,
                        activeIdempotencyKey = event.idempotencyKey,
                        lastProblem = null
                    )
                }
            }

            is CheckoutEvent.ReservationSucceeded -> {
                if (state.phase != CheckoutPhase.RESERVING) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.RESERVED,
                        activeOrder = event.snapshot,
                        contractUpgradeRecommended = event.snapshot.isBackendContractNewerThanClient,
                        lastProblem = null
                    )
                }
            }

            is CheckoutEvent.ReservationRejectedOutOfStock -> {
                if (state.phase != CheckoutPhase.RESERVING) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.REJECTED_OUT_OF_STOCK,
                        lastProblem = event.problem
                    )
                }
            }

            is CheckoutEvent.AuthorizePayment -> {
                if (state.phase != CheckoutPhase.RESERVED) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.PAYMENT_PROCESSING,
                        activeIdempotencyKey = event.paymentIdempotencyKey,
                        lastProblem = null
                    )
                }
            }

            is CheckoutEvent.PaymentFailedRetryable -> {
                if (state.phase != CheckoutPhase.PAYMENT_PROCESSING) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.RESERVED
                    )
                }
            }

            is CheckoutEvent.OrderConfirmedAndSettled -> {
                if (state.phase != CheckoutPhase.PAYMENT_PROCESSING && state.phase != CheckoutPhase.RESERVED) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.SETTLED,
                        activeOrder = event.snapshot,
                        contractUpgradeRecommended = event.snapshot.isBackendContractNewerThanClient,
                        lastProblem = null
                    )
                }
            }

            is CheckoutEvent.ReservationExpired -> {
                if (state.phase != CheckoutPhase.RESERVED && state.phase != CheckoutPhase.PAYMENT_PROCESSING) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.EXPIRED,
                        lastProblem = event.problem
                    )
                }
            }

            is CheckoutEvent.UserCancelReservation -> {
                if (state.phase != CheckoutPhase.RESERVED) {
                    state
                } else {
                    state.copy(
                        phase = CheckoutPhase.CANCELLED
                    )
                }
            }

            is CheckoutEvent.ResetFlow -> state.copy(
                phase = CheckoutPhase.IDLE,
                selectedCampaignId = null,
                activeIdempotencyKey = null,
                activeOrder = null,
                lastProblem = null
            )
        }
    }
}
