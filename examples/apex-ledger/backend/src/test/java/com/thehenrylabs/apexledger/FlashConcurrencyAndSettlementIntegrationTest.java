package com.thehenrylabs.apexledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.thehenrylabs.apexledger.catalog.CatalogPublicApi;
import com.thehenrylabs.apexledger.catalog.FlashCampaignDto;
import com.thehenrylabs.apexledger.catalog.StockReservationOutcome;
import com.thehenrylabs.apexledger.ordering.ApexLedgerController;
import com.thehenrylabs.apexledger.ordering.BurstSimulationRequest;
import com.thehenrylabs.apexledger.ordering.BurstSimulationResponseDto;
import com.thehenrylabs.apexledger.ordering.ConfirmOrderRequest;
import com.thehenrylabs.apexledger.ordering.CreateReservationRequest;
import com.thehenrylabs.apexledger.ordering.OrderCommandService;
import com.thehenrylabs.apexledger.ordering.OrderRepository;
import com.thehenrylabs.apexledger.ordering.OrderSnapshotDto;
import com.thehenrylabs.apexledger.ordering.OutOfStockException;
import com.thehenrylabs.apexledger.ordering.ProblemDetailsDto;
import com.thehenrylabs.apexledger.ordering.ReservationExpiredException;
import com.thehenrylabs.apexledger.settlement.LedgerSummaryDto;
import com.thehenrylabs.apexledger.settlement.SettlementPublicApi;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

@SpringBootTest
class FlashConcurrencyAndSettlementIntegrationTest {

    private static final UUID H200_CAMPAIGN_ID =
        UUID.fromString("11111111-1111-4111-8111-111111111101");

    @Autowired
    private OrderCommandService orderCommandService;

    @Autowired
    private CatalogPublicApi catalogApi;

    @Autowired
    private SettlementPublicApi settlementApi;

    @Autowired
    private ApexLedgerController controller;

    @BeforeEach
    void resetDemo() {
        orderCommandService.resetAllDemoState();
    }

    @Test
    void preventsOversellingWhen50VirtualThreadsRaceFor10Items() {
        BurstSimulationResponseDto result = orderCommandService.simulateConcurrencyBurst(
            new BurstSimulationRequest(H200_CAMPAIGN_ID, 50)
        );

        assertThat(result.concurrentBuyers()).isEqualTo(50);
        assertThat(result.reservedSuccessCount()).isEqualTo(10);
        assertThat(result.rejectedOutOfStockCount()).isEqualTo(40);
        assertThat(result.remainingStockAfterBurst()).isZero();
        assertThat(result.oversellCount()).isZero();
        assertThat(result.invariantPreserved()).isTrue();
    }

    @Test
    void enforcesIdempotencyOnRepeatedReservationAndConfirmationCalls() {
        String reserveKey = UUID.randomUUID().toString();
        CreateReservationRequest req = new CreateReservationRequest(
            H200_CAMPAIGN_ID,
            "buyer-idempotent-01",
            2
        );

        OrderSnapshotDto first = orderCommandService.createReservation(req, reserveKey);
        OrderSnapshotDto replay = orderCommandService.createReservation(req, reserveKey);

        assertThat(first.idempotentReplay()).isFalse();
        assertThat(replay.idempotentReplay()).isTrue();
        assertThat(replay.orderId()).isEqualTo(first.orderId());

        FlashCampaignDto campaignAfterReplay = catalogApi.findById(H200_CAMPAIGN_ID).orElseThrow();
        assertThat(campaignAfterReplay.remainingStock()).isEqualTo(8);
        assertThat(campaignAfterReplay.reservedStock()).isEqualTo(2);

        String confirmKey = UUID.randomUUID().toString();
        OrderSnapshotDto settledFirst = orderCommandService.confirmAndSettleOrder(
            first.orderId(),
            new ConfirmOrderRequest("tok_visa_institutional"),
            confirmKey
        );
        OrderSnapshotDto settledReplay = orderCommandService.confirmAndSettleOrder(
            first.orderId(),
            new ConfirmOrderRequest("tok_visa_institutional"),
            confirmKey
        );

        assertThat(settledFirst.status()).isEqualTo("SETTLED");
        assertThat(settledFirst.idempotentReplay()).isFalse();
        assertThat(settledReplay.idempotentReplay()).isTrue();
        assertThat(settledReplay.settlementReceipt().transactionId())
            .isEqualTo(settledFirst.settlementReceipt().transactionId());

        LedgerSummaryDto summary = settlementApi.getLedgerSummary();
        assertThat(summary.settledOrdersCount()).isEqualTo(1);
        assertThat(summary.totalDebitCents()).isEqualTo(499800L);
        assertThat(summary.totalCreditCents()).isEqualTo(499800L);
        assertThat(summary.netBalanceCents()).isZero();
        assertThat(summary.zeroSumInvariantHold()).isTrue();
    }

    @Test
    void releasesReservedStockWhenHoldExpiresAndHandlesControllerExceptions() {
        StockReservationOutcome invalidQty = catalogApi.tryReserveStock(H200_CAMPAIGN_ID, 0);
        assertThat(invalidQty.reserved()).isFalse();

        catalogApi.releaseReservedStock(H200_CAMPAIGN_ID, 0);

        OrderSnapshotDto reserved = orderCommandService.createReservation(
            new CreateReservationRequest(H200_CAMPAIGN_ID, "buyer-ttl-test", 1),
            UUID.randomUUID().toString()
        );
        OrderSnapshotDto fetched = controller.getOrder(reserved.orderId()).getBody();
        assertThat(fetched.orderId()).isEqualTo(reserved.orderId());

        ResponseEntity<BurstSimulationResponseDto> burstRes = controller.simulateBurst(
            new BurstSimulationRequest(
                UUID.fromString("11111111-1111-4111-8111-111111111102"),
                5
            )
        );
        assertThat(burstRes.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(burstRes.getBody().reservedSuccessCount()).isEqualTo(5);

        ResponseEntity< ProblemDetailsDto> expiredProblem = controller.handleExpired(
            new ReservationExpiredException("Hold expired")
        );
        assertThat(expiredProblem.getStatusCode()).isEqualTo(HttpStatus.GONE);

        ResponseEntity<ProblemDetailsDto> badReqProblem = controller.handleBadRequest(
            new IllegalArgumentException("Bad input")
        );
        assertThat(badReqProblem.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        assertThatThrownBy(() ->
            orderCommandService.createReservation(
                new CreateReservationRequest(H200_CAMPAIGN_ID, "buyer-no-key", 1),
                " "
            )
        ).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() ->
            settlementApi.postDoubleEntrySettlement(UUID.randomUUID(), 0L)
        ).isInstanceOf(IllegalArgumentException.class);

        controller.resetDemoState();
        assertThat(catalogApi.findById(H200_CAMPAIGN_ID).orElseThrow().remainingStock())
            .isEqualTo(10);
    }

    @Test
    void verifiesMockitoSeamIsolationOnOrderCommandService() {
        OrderRepository mockRepo = mock(OrderRepository.class);
        CatalogPublicApi mockCatalog = mock(CatalogPublicApi.class);
        SettlementPublicApi mockSettlement = mock(SettlementPublicApi.class);

        UUID campaignId = UUID.randomUUID();
        when(mockRepo.findByIdempotencyKey("idem-mock-1")).thenReturn(Optional.empty());
        when(mockCatalog.tryReserveStock(campaignId, 1)).thenReturn(
            new StockReservationOutcome(false, null, "Simulated Redis Lock Rejection")
        );

        OrderCommandService isolatedService = new OrderCommandService(
            mockRepo,
            mockCatalog,
            mockSettlement
        );
        ReflectionTestUtils.setField(isolatedService, "contractVersion", "2026-10-25");
        ReflectionTestUtils.setField(isolatedService, "reservationTtlMs", 600000L);

        assertThatThrownBy(() ->
            isolatedService.createReservation(
                new CreateReservationRequest(campaignId, "buyer-mock", 1),
                "idem-mock-1"
            )
        ).isInstanceOf(OutOfStockException.class)
            .hasMessageContaining("Simulated Redis Lock Rejection");
    }
}
