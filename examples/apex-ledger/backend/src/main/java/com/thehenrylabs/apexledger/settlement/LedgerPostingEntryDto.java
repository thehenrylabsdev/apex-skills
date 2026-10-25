package com.thehenrylabs.apexledger.settlement;

public record LedgerPostingEntryDto(
    String entryId,
    String orderId,
    String transactionId,
    String direction,
    String accountCode,
    long amountCents,
    String createdAtIso
) {}
