package com.thehenrylabs.apexledger.android.navigation

import kotlinx.serialization.Serializable

/**
 * Jetpack Navigation 3 typed route keys (`NavKey` pattern) for Android backstack management.
 */
@Serializable
sealed interface ApexNavKey {
    @Serializable
    data object CampaignFeedRoute : ApexNavKey

    @Serializable
    data class FlashCheckoutRoute(val campaignId: String, val skuCode: String) : ApexNavKey

    @Serializable
    data class LedgerReceiptRoute(val orderId: String, val transactionId: String) : ApexNavKey
}

class Navigation3BackStack(
    initialRoute: ApexNavKey = ApexNavKey.CampaignFeedRoute
) {
    private val stack: MutableList<ApexNavKey> = mutableListOf(initialRoute)

    val entries: List<ApexNavKey>
        get() = stack.toList()

    val currentRoute: ApexNavKey
        get() = stack.last()

    fun navigateTo(route: ApexNavKey) {
        stack.add(route)
    }

    fun popBack(): Boolean {
        if (stack.size <= 1) {
            return false
        }
        stack.removeAt(stack.lastIndex)
        return true
    }

    fun resetToRoot() {
        val root = stack.first()
        stack.clear()
        stack.add(root)
    }
}
