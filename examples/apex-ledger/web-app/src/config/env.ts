export type AppEnvironmentCode = "LOCAL" | "DEV" | "PROD";

export interface EnvironmentProfile {
  readonly code: AppEnvironmentCode;
  readonly label: string;
  readonly apiBaseUrl: string;
  readonly contractVersion: string;
  readonly requestTimeoutMs: number;
  readonly enableBurstSimulator: boolean;
  readonly tlsPinned: boolean;
}

export const CLIENT_SUPPORTED_CONTRACT_VERSION = "2026-10-25";

export const ENVIRONMENT_PROFILES: Readonly<Record<AppEnvironmentCode, EnvironmentProfile>> = {
  LOCAL: {
    code: "LOCAL",
    label: "LOCAL (Spring Boot 4.1.2 :8080)",
    apiBaseUrl: "http://localhost:8080/api/v1",
    contractVersion: CLIENT_SUPPORTED_CONTRACT_VERSION,
    requestTimeoutMs: 15000,
    enableBurstSimulator: true,
    tlsPinned: false,
  },
  DEV: {
    code: "DEV",
    label: "DEV (Staging Cluster)",
    apiBaseUrl: "https://dev-api.apexledger.internal/api/v1",
    contractVersion: CLIENT_SUPPORTED_CONTRACT_VERSION,
    requestTimeoutMs: 10000,
    enableBurstSimulator: true,
    tlsPinned: false,
  },
  PROD: {
    code: "PROD",
    label: "PROD (Institutional Mainnet)",
    apiBaseUrl: "https://api.apexledger.io/api/v1",
    contractVersion: CLIENT_SUPPORTED_CONTRACT_VERSION,
    requestTimeoutMs: 5000,
    enableBurstSimulator: false,
    tlsPinned: true,
  },
};

export function resolveEnvironmentProfile(rawCode?: string | null): EnvironmentProfile {
  const normalized = rawCode?.trim().toUpperCase();
  if (normalized === "DEV") {
    return ENVIRONMENT_PROFILES.DEV;
  }
  if (normalized === "PROD") {
    return ENVIRONMENT_PROFILES.PROD;
  }
  return ENVIRONMENT_PROFILES.LOCAL;
}
