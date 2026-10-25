package com.thehenrylabs.apexledger.ordering;

public class ReservationExpiredException extends RuntimeException {

    public ReservationExpiredException(String message) {
        super(message);
    }
}
