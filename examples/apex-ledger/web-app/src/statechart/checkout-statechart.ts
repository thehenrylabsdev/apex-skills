import type { AppEnvironmentCode } from "../config/env";
import type { CheckoutPhase, OrderSnapshotDto, ProblemDetailsDto } from "../contracts/contract-validator";

export interface WebCheckoutState {
  readonly environment: AppEnvironmentCode;
  readonly phase: CheckoutPhase;
  readonly selectedCampaignId: string;
  readonly activeIdempotencyKey: string | null;
  readonly activeOrder: OrderSnapshotDto | null;
  readonly lastProblem: ProblemDetailsDto | null;
  readonly contractUpgradeNotice: boolean;
}

export type WebCheckoutEvent =
  | { readonly type: "SWITCH_ENVIRONMENT"; readonly environment: AppEnvironmentCode }
  | { readonly type: "SELECT_CAMPAIGN"; readonly campaignId: string }
  | { readonly type: "SUBMIT_RESERVATION"; readonly campaignId: string; readonly idempotencyKey: string }
  | { readonly type: "RESERVATION_SUCCEEDED"; readonly snapshot: OrderSnapshotDto }
  | { readonly type: "RESERVATION_REJECTED_OUT_OF_STOCK"; readonly problem: ProblemDetailsDto }
  | { readonly type: "AUTHORIZE_PAYMENT"; readonly idempotencyKey: string }
  | { readonly type: "ORDER_CONFIRMED_AND_SETTLED"; readonly snapshot: OrderSnapshotDto }
  | { readonly type: "RESET_FLOW" };

export function createInitialWebCheckoutState(
  environment: AppEnvironmentCode = "LOCAL"
): WebCheckoutState {
  return {
    environment,
    phase: "IDLE",
    selectedCampaignId: "11111111-1111-4111-8111-111111111101",
    activeIdempotencyKey: null,
    activeOrder: null,
    lastProblem: null,
    contractUpgradeNotice: false,
  };
}

export function reduceWebCheckoutState(
  state: WebCheckoutState,
  event: WebCheckoutEvent
): WebCheckoutState {
  switch (event.type) {
    case "SWITCH_ENVIRONMENT":
      return {
        ...createInitialWebCheckoutState(event.environment),
        selectedCampaignId: state.selectedCampaignId,
      };

    case "SELECT_CAMPAIGN":
      return {
        ...state,
        selectedCampaignId: event.campaignId,
      };

    case "SUBMIT_RESERVATION":
      return {
        ...state,
        phase: "RESERVING",
        selectedCampaignId: event.campaignId,
        activeIdempotencyKey: event.idempotencyKey,
        lastProblem: null,
      };

    case "RESERVATION_SUCCEEDED":
      return {
        ...state,
        phase: "RESERVED",
        activeOrder: event.snapshot,
        contractUpgradeNotice: event.snapshot.isBackendContractNewerThanClient,
        lastProblem: null,
      };

    case "RESERVATION_REJECTED_OUT_OF_STOCK":
      return {
        ...state,
        phase: "REJECTED_OUT_OF_STOCK",
        lastProblem: event.problem,
      };

    case "AUTHORIZE_PAYMENT":
      return {
        ...state,
        phase: "PAYMENT_PROCESSING",
        activeIdempotencyKey: event.idempotencyKey,
        lastProblem: null,
      };

    case "ORDER_CONFIRMED_AND_SETTLED":
      return {
        ...state,
        phase: "SETTLED",
        activeOrder: event.snapshot,
        contractUpgradeNotice: event.snapshot.isBackendContractNewerThanClient,
        lastProblem: null,
      };

    case "RESET_FLOW":
      return {
        ...state,
        phase: "IDLE",
        activeIdempotencyKey: null,
        activeOrder: null,
        lastProblem: null,
      };
  }
}
