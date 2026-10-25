import Foundation
import Testing
@testable import ApexLedgerIOS

@Suite("ApexLedger iOS Swift 6.4 Contract & Statechart Verification")
struct ApexLedgerIOSTests {

    private func loadContractData(_ fileName: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("contracts")
            .appendingPathComponent(fileName)
        return try Data(contentsOf: url)
    }

    @Test("Decodes all canonical v1 JSON contracts and verifies double-entry invariants")
    func testCanonicalV1Contracts() throws {
        let decoder = JSONDecoder()

        let campaigns = try decoder.decode(
            CampaignListResponse.self,
            from: loadContractData("campaigns-response.json")
        )
        #expect(campaigns.contractVersion == "2026-10-25")
        #expect(campaigns.campaigns.count == 3)
        #expect(campaigns.campaigns.allSatisfy { $0.isInventoryConserved })

        let reserved = try decoder.decode(
            OrderSnapshot.self,
            from: loadContractData("reservation-created.json")
        )
        #expect(reserved.status == .reserved)
        #expect(!reserved.isBackendContractNewerThanClient)

        let settled = try decoder.decode(
            OrderSnapshot.self,
            from: loadContractData("order-confirmed-settled.json")
        )
        #expect(settled.status == .settled)
        #expect(settled.settlementReceipt?.isBalancedDoubleEntry == true)

        let ledger = try decoder.decode(
            LedgerSummary.self,
            from: loadContractData("ledger-summary.json")
        )
        #expect(ledger.zeroSumInvariantHold)
        #expect(ledger.netBalanceCents == 0)

        let problem = try decoder.decode(
            ProblemDetails.self,
            from: loadContractData("problem-out-of-stock.json")
        )
        #expect(problem.status == 409)
        #expect(problem.errorCode == "PROBLEM_OUT_OF_STOCK")
    }

    @Test("Forward Compatibility: Un-updated iOS v1 client safely decodes Backend v2 payload")
    func testForwardCompatibilityV2Payload() throws {
        let decoder = JSONDecoder()
        let v2Order = try decoder.decode(
            OrderSnapshot.self,
            from: loadContractData("forward-compatible-v2-order.json")
        )
        #expect(v2Order.status == .settled)
        #expect(v2Order.isBackendContractNewerThanClient)
        #expect(v2Order.settlementReceipt?.isBalancedDoubleEntry == true)

        var state = IosCheckoutState(environment: .prod)
        state = IosCheckoutStatechart.reduce(
            state: state,
            event: .submitReservation(idempotencyKey: v2Order.idempotencyKey)
        )
        #expect(state.phase == .reserving)

        state = IosCheckoutStatechart.reduce(
            state: state,
            event: .orderConfirmedAndSettled(v2Order)
        )
        #expect(state.phase == .settled)
        #expect(state.contractUpgradeRecommended)
    }
}
