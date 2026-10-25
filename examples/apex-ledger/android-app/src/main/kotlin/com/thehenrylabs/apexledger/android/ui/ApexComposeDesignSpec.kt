package com.thehenrylabs.apexledger.android.ui

import com.thehenrylabs.apexledger.shared.config.AppEnvironment
import com.thehenrylabs.apexledger.shared.model.CheckoutPhase
import com.thehenrylabs.apexledger.shared.statechart.CheckoutUiState

/**
 * Normative tokens from DESIGNS.md and Compose accessibility contract
 * verified by mobile WCAG 2.2 AA gate:
 * - Minimum touch target: 48x48dp (`minHeight = 48.dp`, `minWidth = 48.dp`)
 * - Adaptive edge-to-edge: `WindowInsets.safeDrawing`
 * - Vector icons only (Material Symbols / Outlined Vectors, zero unicode emojis)
 */
object ApexComposeDesignSpec {
    const val PRIMARY_HEX = 0xFF0F172A
    const val SECONDARY_HEX = 0xFF1D4ED8
    const val SURFACE_HEX = 0xFFFFFFFF
    const val BACKGROUND_HEX = 0xFFF8FAFC
    const val BORDER_HEX = 0xFF64748B
    const val SUCCESS_HEX = 0xFF15803D
    const val ERROR_HEX = 0xFFB91C1C
    const val MIN_TOUCH_TARGET_DP = 48

    fun buildScreenAccessibilitySummary(state: CheckoutUiState): Map<String, String> {
        return mapOf(
            "windowInsets" to "WindowInsets.safeDrawing",
            "minTouchTargetDp" to "${MIN_TOUCH_TARGET_DP}dp",
            "environmentContentDescription" to "Active environment ${state.environment.envCode} (${state.environment.androidEmulatorBaseUrl})",
            "phaseContentDescription" to "Checkout phase ${state.phase.name}",
            "vectorIconName" to when (state.phase) {
                CheckoutPhase.SETTLED -> "Icons.Outlined.Verified"
                CheckoutPhase.REJECTED_OUT_OF_STOCK, CheckoutPhase.EXPIRED -> "Icons.Outlined.WarningAmber"
                else -> "Icons.Outlined.Shield"
            },
            "contractBanner" to if (state.contractUpgradeRecommended) {
                "Newer Backend API contract detected; running in forward-compatible v1 mode"
            } else {
                "Contract synchronized (${AppEnvironment.CLIENT_SUPPORTED_CONTRACT_VERSION})"
            }
        )
    }
}
