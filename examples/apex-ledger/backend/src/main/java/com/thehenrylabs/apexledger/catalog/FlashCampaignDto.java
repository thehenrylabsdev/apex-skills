package com.thehenrylabs.apexledger.catalog;

import java.util.UUID;

public record FlashCampaignDto(
    UUID campaignId,
    String skuCode,
    String title,
    String subtitle,
    long unitPriceCents,
    String currency,
    int initialAllocation,
    int remainingStock,
    int reservedStock,
    int settledStock,
    String status
) {}
