package com.thehenrylabs.apexledger.ordering;

import jakarta.validation.constraints.NotBlank;

public record ConfirmOrderRequest(
    @NotBlank String paymentMethodToken
) {}
