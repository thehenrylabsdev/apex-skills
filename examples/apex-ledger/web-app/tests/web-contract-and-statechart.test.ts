import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  ENVIRONMENT_PROFILES,
  resolveEnvironmentProfile,
} from "../src/config/env";
import {
  parseCampaignListResponse,
  parseLedgerSummary,
  parseOrderSnapshot,
  parseProblemDetails,
} from "../src/contracts/contract-validator";
import {
  createInitialWebCheckoutState,
  reduceWebCheckoutState,
} from "../src/statechart/checkout-statechart";

const CONTRACTS_DIR = findContractsDirectory(__dirname);

function findContractsDirectory(start: string): string {
  let current = start;
  while (path.dirname(current) !== current) {
    const candidate = path.join(current, "contracts", "campaigns-response.json");
    if (fs.existsSync(candidate)) {
      return path.dirname(candidate);
    }
    current = path.dirname(current);
  }
  throw new Error("ApexLedger contract fixtures were not found.");
}

function readJsonFixture(fileName: string): unknown {
  const fullPath = path.join(CONTRACTS_DIR, fileName);
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as unknown;
}

void describe("ApexLedger Web App Contract & Statechart Verification", () => {
  void it("resolves LOCAL, DEV, and PROD environment profiles accurately", () => {
    assert.equal(resolveEnvironmentProfile("local").code, "LOCAL");
    assert.equal(resolveEnvironmentProfile("DEV").code, "DEV");
    assert.equal(resolveEnvironmentProfile("prod").code, "PROD");
    assert.equal(ENVIRONMENT_PROFILES.PROD.tlsPinned, true);
    assert.equal(ENVIRONMENT_PROFILES.PROD.enableBurstSimulator, false);
  });

  void it("validates all canonical v1 wire fixtures and forward-compatible v2 payloads", () => {
    const campaigns = parseCampaignListResponse(
      readJsonFixture("campaigns-response.json")
    );
    assert.equal(campaigns.contractVersion, "2026-10-25");
    assert.equal(campaigns.campaigns.length, 3);

    const reserved = parseOrderSnapshot(
      readJsonFixture("reservation-created.json")
    );
    assert.equal(reserved.status, "RESERVED");
    assert.equal(reserved.isBackendContractNewerThanClient, false);

    const settled = parseOrderSnapshot(
      readJsonFixture("order-confirmed-settled.json")
    );
    assert.equal(settled.status, "SETTLED");
    assert.equal(settled.settlementReceipt?.zeroSumVerified, true);

    const ledger = parseLedgerSummary(readJsonFixture("ledger-summary.json"));
    assert.equal(ledger.zeroSumInvariantHold, true);
    assert.equal(ledger.netBalanceCents, 0);

    const problem = parseProblemDetails(
      readJsonFixture("problem-out-of-stock.json")
    );
    assert.equal(problem.status, 409);
    assert.equal(problem.errorCode, "PROBLEM_OUT_OF_STOCK");

    const v2Settled = parseOrderSnapshot(
      readJsonFixture("forward-compatible-v2-order.json")
    );
    assert.equal(v2Settled.status, "SETTLED");
    assert.equal(v2Settled.isBackendContractNewerThanClient, true);
  });

  void it("transitions deterministically across all WebCheckoutState phases", () => {
    const v2Settled = parseOrderSnapshot(
      readJsonFixture("forward-compatible-v2-order.json")
    );
    let state = createInitialWebCheckoutState("LOCAL");
    state = reduceWebCheckoutState(state, {
      type: "SWITCH_ENVIRONMENT",
      environment: "DEV",
    });
    assert.equal(state.environment, "DEV");

    state = reduceWebCheckoutState(state, {
      type: "SUBMIT_RESERVATION",
      campaignId: v2Settled.campaignId,
      idempotencyKey: v2Settled.idempotencyKey,
    });
    assert.equal(state.phase, "RESERVING");

    state = reduceWebCheckoutState(state, {
      type: "ORDER_CONFIRMED_AND_SETTLED",
      snapshot: v2Settled,
    });
    assert.equal(state.phase, "SETTLED");
    assert.equal(state.contractUpgradeNotice, true);

    state = reduceWebCheckoutState(state, { type: "RESET_FLOW" });
    assert.equal(state.phase, "IDLE");
  });
});
