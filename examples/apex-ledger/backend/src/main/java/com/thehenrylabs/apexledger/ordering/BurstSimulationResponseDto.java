package com.thehenrylabs.apexledger.ordering;

public record BurstSimulationResponseDto(
    String campaignId,
    int concurrentBuyers,
    int reservedSuccessCount,
    int rejectedOutOfStockCount,
    int remainingStockAfterBurst,
    int oversellCount,
    boolean invariantPreserved,
    long durationMs
) {}
