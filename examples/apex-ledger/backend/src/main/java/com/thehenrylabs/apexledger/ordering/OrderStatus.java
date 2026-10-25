package com.thehenrylabs.apexledger.ordering;

public enum OrderStatus {
    IDLE,
    RESERVING,
    RESERVED,
    PAYMENT_PROCESSING,
    CONFIRMED,
    SETTLED,
    REJECTED_OUT_OF_STOCK,
    EXPIRED,
    CANCELLED
}
