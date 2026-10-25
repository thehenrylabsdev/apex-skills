package com.thehenrylabs.apexledger.ordering;

import com.thehenrylabs.apexledger.catalog.CampaignListResponseDto;
import com.thehenrylabs.apexledger.catalog.CatalogPublicApi;
import com.thehenrylabs.apexledger.settlement.LedgerSummaryDto;
import com.thehenrylabs.apexledger.settlement.SettlementPublicApi;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ApexLedgerController {

    private final CatalogPublicApi catalogApi;
    private final OrderCommandService orderCommandService;
    private final SettlementPublicApi settlementApi;

    @GetMapping("/campaigns")
    public ResponseEntity<CampaignListResponseDto> listCampaigns() {
        return ResponseEntity.ok(catalogApi.listCampaigns());
    }

    @PostMapping("/orders/reservations")
    public ResponseEntity<OrderSnapshotDto> createReservation(
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @Valid @RequestBody CreateReservationRequest request
    ) {
        OrderSnapshotDto snapshot = orderCommandService.createReservation(request, idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(snapshot);
    }

    @PostMapping("/orders/{orderId}/confirm")
    public ResponseEntity<OrderSnapshotDto> confirmOrder(
        @PathVariable("orderId") UUID orderId,
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @Valid @RequestBody ConfirmOrderRequest request
    ) {
        OrderSnapshotDto snapshot = orderCommandService.confirmAndSettleOrder(
            orderId,
            request,
            idempotencyKey
        );
        return ResponseEntity.ok(snapshot);
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<OrderSnapshotDto> getOrder(@PathVariable("orderId") UUID orderId) {
        return ResponseEntity.ok(orderCommandService.getOrder(orderId));
    }

    @GetMapping("/ops/ledger-summary")
    public ResponseEntity<LedgerSummaryDto> getLedgerSummary() {
        return ResponseEntity.ok(settlementApi.getLedgerSummary());
    }

    @PostMapping("/ops/simulate-burst")
    public ResponseEntity<BurstSimulationResponseDto> simulateBurst(
        @Valid @RequestBody BurstSimulationRequest request
    ) {
        return ResponseEntity.ok(orderCommandService.simulateConcurrencyBurst(request));
    }

    @PostMapping("/ops/reset")
    public ResponseEntity<CampaignListResponseDto> resetDemoState() {
        orderCommandService.resetAllDemoState();
        return ResponseEntity.ok(catalogApi.listCampaigns());
    }

    @ExceptionHandler(OutOfStockException.class)
    public ResponseEntity<ProblemDetailsDto> handleOutOfStock(OutOfStockException ex) {
        ProblemDetailsDto problem = new ProblemDetailsDto(
            "https://api.apexledger.io/problems/out-of-stock",
            "Flash Allocation Exhausted",
            HttpStatus.CONFLICT.value(),
            ex.getMessage(),
            "PROBLEM_OUT_OF_STOCK",
            "trc-" + UUID.randomUUID().toString().substring(0, 8)
        );
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem);
    }

    @ExceptionHandler(ReservationExpiredException.class)
    public ResponseEntity<ProblemDetailsDto> handleExpired(ReservationExpiredException ex) {
        ProblemDetailsDto problem = new ProblemDetailsDto(
            "https://api.apexledger.io/problems/reservation-expired",
            "Reservation Hold Expired",
            HttpStatus.GONE.value(),
            ex.getMessage(),
            "PROBLEM_RESERVATION_EXPIRED",
            "trc-" + UUID.randomUUID().toString().substring(0, 8)
        );
        return ResponseEntity.status(HttpStatus.GONE)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetailsDto> handleBadRequest(IllegalArgumentException ex) {
        ProblemDetailsDto problem = new ProblemDetailsDto(
            "https://api.apexledger.io/problems/invalid-request",
            "Invalid Request Payload",
            HttpStatus.BAD_REQUEST.value(),
            ex.getMessage(),
            "PROBLEM_INVALID_REQUEST",
            "trc-" + UUID.randomUUID().toString().substring(0, 8)
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem);
    }
}
