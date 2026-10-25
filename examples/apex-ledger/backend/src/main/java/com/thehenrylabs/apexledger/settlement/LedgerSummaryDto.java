package com.thehenrylabs.apexledger.settlement;

import java.util.List;

public record LedgerSummaryDto(
    String contractVersion,
    String environment,
    long totalDebitCents,
    long totalCreditCents,
    long netBalanceCents,
    boolean zeroSumInvariantHold,
    int settledOrdersCount,
    List<LedgerPostingEntryDto> entries
) {}
