package com.thehenrylabs.apexledger.ordering;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record BurstSimulationRequest(
    @NotNull UUID campaignId,
    @Min(1) @Max(200) int concurrentBuyers
) {}
