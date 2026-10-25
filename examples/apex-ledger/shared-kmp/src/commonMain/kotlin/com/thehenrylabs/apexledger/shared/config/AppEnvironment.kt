package com.thehenrylabs.apexledger.shared.config

/**
 * Standardized 3-environment configuration shared across Android (Jetpack Compose)
 * and iOS (SwiftUI) via Kotlin Multiplatform.
 */
enum class AppEnvironment(
    val envCode: String,
    val baseUrl: String,
    val androidEmulatorBaseUrl: String,
    val requestTimeoutMs: Long,
    val enforceTlsPinning: Boolean,
    val enableBurstSimulator: Boolean
) {
    LOCAL(
        envCode = "LOCAL",
        baseUrl = "http://localhost:8080/api/v1",
        androidEmulatorBaseUrl = "http://10.0.2.2:8080/api/v1",
        requestTimeoutMs = 15_000L,
        enforceTlsPinning = false,
        enableBurstSimulator = true
    ),
    DEV(
        envCode = "DEV",
        baseUrl = "https://dev-api.apexledger.internal/api/v1",
        androidEmulatorBaseUrl = "https://dev-api.apexledger.internal/api/v1",
        requestTimeoutMs = 10_000L,
        enforceTlsPinning = false,
        enableBurstSimulator = true
    ),
    PROD(
        envCode = "PROD",
        baseUrl = "https://api.apexledger.io/api/v1",
        androidEmulatorBaseUrl = "https://api.apexledger.io/api/v1",
        requestTimeoutMs = 5_000L,
        enforceTlsPinning = true,
        enableBurstSimulator = false
    );

    companion object {
        const val CLIENT_SUPPORTED_CONTRACT_VERSION = "2026-10-25"

        fun fromCode(raw: String?): AppEnvironment {
            return entries.firstOrNull { it.envCode.equals(raw?.trim(), ignoreCase = true) } ?: LOCAL
        }
    }
}
