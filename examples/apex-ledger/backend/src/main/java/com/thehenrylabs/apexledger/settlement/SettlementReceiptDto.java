package com.thehenrylabs.apexledger.settlement;

public record SettlementReceiptDto(
    String transactionId,
    String debitAccountCode,
    String creditAccountCode,
    long debitAmountCents,
    long creditAmountCents,
    boolean zeroSumVerified,
    String settledAtIso
) {}
