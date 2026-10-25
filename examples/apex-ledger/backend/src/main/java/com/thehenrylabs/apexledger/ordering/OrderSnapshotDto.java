package com.thehenrylabs.apexledger.ordering;

import com.thehenrylabs.apexledger.settlement.SettlementReceiptDto;
import java.util.UUID;

public record OrderSnapshotDto(
    UUID orderId,
    UUID campaignId,
    String skuCode,
    String buyerId,
    int quantity,
    long totalAmountCents,
    String currency,
    String status,
    String idempotencyKey,
    boolean idempotentReplay,
    long expiresAtEpochMs,
    String contractVersion,
    SettlementReceiptDto settlementReceipt
) {}
