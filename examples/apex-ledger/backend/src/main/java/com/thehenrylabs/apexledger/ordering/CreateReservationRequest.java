package com.thehenrylabs.apexledger.ordering;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record CreateReservationRequest(
    @NotNull UUID campaignId,
    @NotBlank String buyerId,
    @Min(1) @Max(5) int quantity
) {}
