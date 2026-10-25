package com.thehenrylabs.apexledger.catalog;

public record StockReservationOutcome(
    boolean reserved,
    FlashCampaignDto campaign,
    String failureReason
) {}
