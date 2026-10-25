package com.thehenrylabs.apexledger.ordering;

public record ProblemDetailsDto(
    String type,
    String title,
    int status,
    String detail,
    String errorCode,
    String traceId
) {}
