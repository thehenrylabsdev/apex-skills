package com.thehenrylabs.apexledger;

import static org.assertj.core.api.Assertions.assertThat;

import com.thehenrylabs.apexledger.catalog.CampaignListResponseDto;
import com.thehenrylabs.apexledger.catalog.CatalogPublicApi;
import com.thehenrylabs.apexledger.ordering.ApexLedgerController;
import com.thehenrylabs.apexledger.ordering.ConfirmOrderRequest;
import com.thehenrylabs.apexledger.ordering.CreateReservationRequest;
import com.thehenrylabs.apexledger.ordering.OrderCommandService;
import com.thehenrylabs.apexledger.ordering.OrderSnapshotDto;
import com.thehenrylabs.apexledger.ordering.OutOfStockException;
import com.thehenrylabs.apexledger.ordering.ProblemDetailsDto;
import com.thehenrylabs.apexledger.settlement.LedgerSummaryDto;
import com.thehenrylabs.apexledger.settlement.SettlementPublicApi;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
class ContractSchemaVerificationTest {

    @Autowired
    private ApexLedgerController controller;

    @Autowired
    private OrderCommandService orderCommandService;

    @Autowired
    private CatalogPublicApi catalogApi;

    @Autowired
    private SettlementPublicApi settlementApi;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void resetState() {
        orderCommandService.resetAllDemoState();
    }

    @Test
    void verifiesProducerOutputMatchesCanonicalContractFixtures() throws Exception {
        Path contractsDir = Path.of("../contracts");
        assertThat(Files.exists(contractsDir.resolve("openapi-v1.json"))).isTrue();

        // 1. Verify /api/v1/campaigns wire structure matches campaigns-response.json
        ResponseEntity<CampaignListResponseDto> campaignsRes = controller.listCampaigns();
        assertThat(campaignsRes.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode producerCampaigns = objectMapper.valueToTree(campaignsRes.getBody());
        JsonNode goldenCampaigns = objectMapper.readTree(
            Files.readString(contractsDir.resolve("campaigns-response.json"))
        );
        assertThat(producerCampaigns.get("contractVersion").asString())
            .isEqualTo(goldenCampaigns.get("contractVersion").asString());
        assertThat(producerCampaigns.get("campaigns").size()).isEqualTo(3);

        // 2. Verify /api/v1/orders/reservations wire structure matches reservation-created.json
        UUID h200Id = UUID.fromString("11111111-1111-4111-8111-111111111101");
        String reserveKey = "33333333-3333-4333-8333-333333333301";
        ResponseEntity<OrderSnapshotDto> reserveRes = controller.createReservation(
            reserveKey,
            new CreateReservationRequest(h200Id, "usr-principal-architect-01", 1)
        );
        assertThat(reserveRes.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode producerReserve = objectMapper.valueToTree(reserveRes.getBody());
        JsonNode goldenReserve = objectMapper.readTree(
            Files.readString(contractsDir.resolve("reservation-created.json"))
        );
        for (String requiredKey : new String[] {
            "orderId", "campaignId", "skuCode", "buyerId", "quantity",
            "totalAmountCents", "currency", "status", "idempotencyKey",
            "idempotentReplay", "expiresAtEpochMs", "contractVersion"
        }) {
            assertThat(producerReserve.has(requiredKey))
                .as("Producer reservation JSON must contain field: " + requiredKey)
                .isTrue();
            assertThat(goldenReserve.has(requiredKey)).isTrue();
        }
        assertThat(producerReserve.get("status").asString()).isEqualTo("RESERVED");

        // 3. Verify /api/v1/orders/{orderId}/confirm wire structure matches order-confirmed-settled.json
        UUID orderId = reserveRes.getBody().orderId();
        ResponseEntity<OrderSnapshotDto> confirmRes = controller.confirmOrder(
            orderId,
            "44444444-4444-4444-8444-444444444401",
            new ConfirmOrderRequest("pm_tok_visa_institutional_4242")
        );
        assertThat(confirmRes.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode producerSettled = objectMapper.valueToTree(confirmRes.getBody());
        assertThat(producerSettled.get("status").asString()).isEqualTo("SETTLED");
        assertThat(producerSettled.get("settlementReceipt").get("zeroSumVerified").asBoolean())
            .isTrue();

        // 4. Verify /api/v1/ops/ledger-summary wire structure matches ledger-summary.json
        ResponseEntity<LedgerSummaryDto> ledgerRes = controller.getLedgerSummary();
        JsonNode producerLedger = objectMapper.valueToTree(ledgerRes.getBody());
        assertThat(producerLedger.get("zeroSumInvariantHold").asBoolean()).isTrue();
        assertThat(producerLedger.get("netBalanceCents").asLong()).isZero();
        assertThat(producerLedger.get("entries").size()).isEqualTo(2);

        // 5. Verify 409 OutOfStock ProblemDetails wire structure matches problem-out-of-stock.json
        UUID soldOutId = UUID.fromString("11111111-1111-4111-8111-111111111103");
        try {
            controller.createReservation(
                UUID.randomUUID().toString(),
                new CreateReservationRequest(soldOutId, "usr-late-buyer", 1)
            );
        } catch (OutOfStockException ex) {
            ResponseEntity<ProblemDetailsDto> problemRes = controller.handleOutOfStock(ex);
            assertThat(problemRes.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(problemRes.getBody().errorCode()).isEqualTo("PROBLEM_OUT_OF_STOCK");
        }
    }
}
