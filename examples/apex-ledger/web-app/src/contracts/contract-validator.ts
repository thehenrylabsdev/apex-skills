import { CLIENT_SUPPORTED_CONTRACT_VERSION } from "../config/env";

export type CheckoutPhase =
  | "IDLE"
  | "RESERVING"
  | "RESERVED"
  | "PAYMENT_PROCESSING"
  | "CONFIRMED"
  | "SETTLED"
  | "REJECTED_OUT_OF_STOCK"
  | "EXPIRED"
  | "CANCELLED";

export interface FlashCampaignDto {
  readonly campaignId: string;
  readonly skuCode: string;
  readonly title: string;
  readonly subtitle: string;
  readonly unitPriceCents: number;
  readonly currency: string;
  readonly initialAllocation: number;
  readonly remainingStock: number;
  readonly reservedStock: number;
  readonly settledStock: number;
  readonly status: "ACTIVE" | "SOLD_OUT" | "PAUSED";
}

export interface CampaignListResponseDto {
  readonly contractVersion: string;
  readonly environment: string;
  readonly campaigns: readonly FlashCampaignDto[];
}

export interface SettlementReceiptDto {
  readonly transactionId: string;
  readonly debitAccountCode: string;
  readonly creditAccountCode: string;
  readonly debitAmountCents: number;
  readonly creditAmountCents: number;
  readonly zeroSumVerified: boolean;
  readonly settledAtIso: string;
}

export interface OrderSnapshotDto {
  readonly orderId: string;
  readonly campaignId: string;
  readonly skuCode: string;
  readonly buyerId: string;
  readonly quantity: number;
  readonly totalAmountCents: number;
  readonly currency: string;
  readonly status: CheckoutPhase;
  readonly idempotencyKey: string;
  readonly idempotentReplay: boolean;
  readonly expiresAtEpochMs: number;
  readonly contractVersion: string;
  readonly settlementReceipt: SettlementReceiptDto | null;
  readonly isBackendContractNewerThanClient: boolean;
}

export interface LedgerPostingEntryDto {
  readonly entryId: string;
  readonly orderId: string;
  readonly transactionId: string;
  readonly direction: "DEBIT" | "CREDIT";
  readonly accountCode: string;
  readonly amountCents: number;
  readonly createdAtIso: string;
}

export interface LedgerSummaryDto {
  readonly contractVersion: string;
  readonly environment: string;
  readonly totalDebitCents: number;
  readonly totalCreditCents: number;
  readonly netBalanceCents: number;
  readonly zeroSumInvariantHold: boolean;
  readonly settledOrdersCount: number;
  readonly entries: readonly LedgerPostingEntryDto[];
}

export interface BurstSimulationResponseDto {
  readonly campaignId: string;
  readonly concurrentBuyers: number;
  readonly reservedSuccessCount: number;
  readonly rejectedOutOfStockCount: number;
  readonly remainingStockAfterBurst: number;
  readonly oversellCount: number;
  readonly invariantPreserved: boolean;
  readonly durationMs: number;
}

export interface ProblemDetailsDto {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly errorCode: string;
  readonly traceId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  if (typeof val !== "string") {
    throw new Error(`Contract violation: expected string for field '${key}'`);
  }
  return val;
}

function readNumber(obj: Record<string, unknown>, key: string): number {
  const val = obj[key];
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new Error(`Contract violation: expected finite number for field '${key}'`);
  }
  return val;
}

function readBoolean(obj: Record<string, unknown>, key: string): boolean {
  const val = obj[key];
  if (typeof val !== "boolean") {
    throw new Error(`Contract violation: expected boolean for field '${key}'`);
  }
  return val;
}

/**
 * Forward-compatible contract parsers: unknown v2 Backend fields are ignored safely
 * while required v1 seam invariants are strictly verified.
 */
export function parseCampaignListResponse(raw: unknown): CampaignListResponseDto {
  if (!isRecord(raw) || !Array.isArray(raw.campaigns)) {
    throw new Error("Contract violation: invalid CampaignListResponse payload");
  }
  const campaigns: FlashCampaignDto[] = raw.campaigns.map((item: unknown) => {
    if (!isRecord(item)) {
      throw new Error("Contract violation: invalid campaign element");
    }
    const statusRaw = readString(item, "status");
    const status: "ACTIVE" | "SOLD_OUT" | "PAUSED" =
      statusRaw === "SOLD_OUT" ? "SOLD_OUT" : statusRaw === "PAUSED" ? "PAUSED" : "ACTIVE";
    return {
      campaignId: readString(item, "campaignId"),
      skuCode: readString(item, "skuCode"),
      title: readString(item, "title"),
      subtitle: readString(item, "subtitle"),
      unitPriceCents: readNumber(item, "unitPriceCents"),
      currency: readString(item, "currency"),
      initialAllocation: readNumber(item, "initialAllocation"),
      remainingStock: readNumber(item, "remainingStock"),
      reservedStock: readNumber(item, "reservedStock"),
      settledStock: readNumber(item, "settledStock"),
      status,
    };
  });

  return {
    contractVersion: readString(raw, "contractVersion"),
    environment: readString(raw, "environment"),
    campaigns,
  };
}

export function parseOrderSnapshot(raw: unknown): OrderSnapshotDto {
  if (!isRecord(raw)) {
    throw new Error("Contract violation: invalid OrderSnapshot payload");
  }
  const receiptRaw = raw.settlementReceipt;
  let settlementReceipt: SettlementReceiptDto | null = null;
  if (isRecord(receiptRaw)) {
    settlementReceipt = {
      transactionId: readString(receiptRaw, "transactionId"),
      debitAccountCode: readString(receiptRaw, "debitAccountCode"),
      creditAccountCode: readString(receiptRaw, "creditAccountCode"),
      debitAmountCents: readNumber(receiptRaw, "debitAmountCents"),
      creditAmountCents: readNumber(receiptRaw, "creditAmountCents"),
      zeroSumVerified: readBoolean(receiptRaw, "zeroSumVerified"),
      settledAtIso: readString(receiptRaw, "settledAtIso"),
    };
  }

  const contractVersion = readString(raw, "contractVersion");
  const statusStr = readString(raw, "status") as CheckoutPhase;

  return {
    orderId: readString(raw, "orderId"),
    campaignId: readString(raw, "campaignId"),
    skuCode: readString(raw, "skuCode"),
    buyerId: readString(raw, "buyerId"),
    quantity: readNumber(raw, "quantity"),
    totalAmountCents: readNumber(raw, "totalAmountCents"),
    currency: readString(raw, "currency"),
    status: statusStr,
    idempotencyKey: readString(raw, "idempotencyKey"),
    idempotentReplay: readBoolean(raw, "idempotentReplay"),
    expiresAtEpochMs: readNumber(raw, "expiresAtEpochMs"),
    contractVersion,
    settlementReceipt,
    isBackendContractNewerThanClient: contractVersion > CLIENT_SUPPORTED_CONTRACT_VERSION,
  };
}

export function parseLedgerSummary(raw: unknown): LedgerSummaryDto {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    throw new Error("Contract violation: invalid LedgerSummary payload");
  }
  const entries: LedgerPostingEntryDto[] = raw.entries.map((item: unknown) => {
    if (!isRecord(item)) {
      throw new Error("Contract violation: invalid ledger posting entry");
    }
    const dir = readString(item, "direction") === "CREDIT" ? "CREDIT" : "DEBIT";
    return {
      entryId: readString(item, "entryId"),
      orderId: readString(item, "orderId"),
      transactionId: readString(item, "transactionId"),
      direction: dir,
      accountCode: readString(item, "accountCode"),
      amountCents: readNumber(item, "amountCents"),
      createdAtIso: readString(item, "createdAtIso"),
    };
  });

  return {
    contractVersion: readString(raw, "contractVersion"),
    environment: readString(raw, "environment"),
    totalDebitCents: readNumber(raw, "totalDebitCents"),
    totalCreditCents: readNumber(raw, "totalCreditCents"),
    netBalanceCents: readNumber(raw, "netBalanceCents"),
    zeroSumInvariantHold: readBoolean(raw, "zeroSumInvariantHold"),
    settledOrdersCount: readNumber(raw, "settledOrdersCount"),
    entries,
  };
}

export function parseProblemDetails(raw: unknown): ProblemDetailsDto {
  if (!isRecord(raw)) {
    throw new Error("Contract violation: invalid ProblemDetails payload");
  }
  return {
    type: readString(raw, "type"),
    title: readString(raw, "title"),
    status: readNumber(raw, "status"),
    detail: readString(raw, "detail"),
    errorCode: readString(raw, "errorCode"),
    traceId: readString(raw, "traceId"),
  };
}
