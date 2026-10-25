package com.thehenrylabs.apexledger.ordering;

import com.thehenrylabs.apexledger.catalog.CatalogPublicApi;
import com.thehenrylabs.apexledger.catalog.FlashCampaignDto;
import com.thehenrylabs.apexledger.catalog.StockReservationOutcome;
import com.thehenrylabs.apexledger.settlement.SettlementLedgerService;
import com.thehenrylabs.apexledger.settlement.SettlementPublicApi;
import com.thehenrylabs.apexledger.settlement.SettlementReceiptDto;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OrderCommandService {

    private final OrderRepository orderRepository;
    private final CatalogPublicApi catalogApi;
    private final SettlementPublicApi settlementApi;
    private final Map<String, OrderSnapshotDto> confirmIdempotencyCache = new ConcurrentHashMap<>();

    @Value("${apex.contract-version:2026-10-25}")
    private String contractVersion;

    @Value("${apex.reservation-ttl-ms:600000}")
    private long reservationTtlMs;

    @Transactional
    public OrderSnapshotDto createReservation(CreateReservationRequest request, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new IllegalArgumentException("Idempotency-Key header is required.");
        }

        OrderEntity existing = orderRepository.findByIdempotencyKey(idempotencyKey).orElse(null);
        if (existing != null) {
            return toSnapshot(existing, true);
        }

        StockReservationOutcome outcome = catalogApi.tryReserveStock(
            request.campaignId(),
            request.quantity()
        );
        if (!outcome.reserved()) {
            throw new OutOfStockException(outcome.failureReason());
        }

        FlashCampaignDto campaign = outcome.campaign();
        long expiresAt = System.currentTimeMillis() + reservationTtlMs;
        long totalCents = campaign.unitPriceCents() * request.quantity();

        OrderEntity entity = OrderEntity.builder()
            .orderId(UUID.randomUUID())
            .campaignId(campaign.campaignId())
            .skuCode(campaign.skuCode())
            .buyerId(request.buyerId())
            .quantity(request.quantity())
            .totalAmountCents(totalCents)
            .currency(campaign.currency())
            .status(OrderStatus.RESERVED)
            .idempotencyKey(idempotencyKey)
            .expiresAtEpochMs(expiresAt)
            .build();

        OrderEntity saved = orderRepository.saveAndFlush(entity);
        return toSnapshot(saved, false);
    }

    @Transactional
    public OrderSnapshotDto confirmAndSettleOrder(
        UUID orderId,
        ConfirmOrderRequest request,
        String idempotencyKey
    ) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new IllegalArgumentException("Idempotency-Key header is required.");
        }

        String cacheKey = orderId + ":" + idempotencyKey;
        OrderSnapshotDto cached = confirmIdempotencyCache.get(cacheKey);
        if (cached != null) {
            return new OrderSnapshotDto(
                cached.orderId(),
                cached.campaignId(),
                cached.skuCode(),
                cached.buyerId(),
                cached.quantity(),
                cached.totalAmountCents(),
                cached.currency(),
                cached.status(),
                cached.idempotencyKey(),
                true,
                cached.expiresAtEpochMs(),
                cached.contractVersion(),
                cached.settlementReceipt()
            );
        }

        OrderEntity entity = orderRepository.findById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order not found: " + orderId));

        if (entity.getStatus() == OrderStatus.SETTLED) {
            return toSnapshot(entity, true);
        }

        if (System.currentTimeMillis() > entity.getExpiresAtEpochMs()) {
            entity.setStatus(OrderStatus.EXPIRED);
            orderRepository.saveAndFlush(entity);
            catalogApi.releaseReservedStock(entity.getCampaignId(), entity.getQuantity());
            throw new ReservationExpiredException(
                "Reservation hold expired for orderId " + orderId + ". Stock released."
            );
        }

        if (request.paymentMethodToken() == null || request.paymentMethodToken().isBlank()) {
            throw new IllegalArgumentException("paymentMethodToken is required.");
        }

        catalogApi.confirmSettledStock(entity.getCampaignId(), entity.getQuantity());
        SettlementReceiptDto receipt = settlementApi.postDoubleEntrySettlement(
            entity.getOrderId(),
            entity.getTotalAmountCents()
        );

        entity.setStatus(OrderStatus.SETTLED);
        entity.setTransactionId(receipt.transactionId());
        entity.setSettledAtIso(receipt.settledAtIso());
        OrderEntity saved = orderRepository.saveAndFlush(entity);

        OrderSnapshotDto snapshot = toSnapshot(saved, false);
        confirmIdempotencyCache.put(cacheKey, snapshot);
        return snapshot;
    }

    @Transactional(readOnly = true)
    public OrderSnapshotDto getOrder(UUID orderId) {
        OrderEntity entity = orderRepository.findById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order not found: " + orderId));
        return toSnapshot(entity, false);
    }

    public BurstSimulationResponseDto simulateConcurrencyBurst(BurstSimulationRequest request) {
        long startNs = System.nanoTime();
        AtomicInteger reservedSuccess = new AtomicInteger(0);
        AtomicInteger rejectedOutOfStock = new AtomicInteger(0);

        List<Callable<Void>> tasks = new ArrayList<>(request.concurrentBuyers());
        for (int i = 0; i < request.concurrentBuyers(); i++) {
            final int buyerIdx = i + 1;
            tasks.add(() -> {
                try {
                    createReservation(
                        new CreateReservationRequest(
                            request.campaignId(),
                            "burst-virtual-thread-buyer-" + buyerIdx,
                            1
                        ),
                        UUID.randomUUID().toString()
                    );
                    reservedSuccess.incrementAndGet();
                } catch (OutOfStockException ex) {
                    rejectedOutOfStock.incrementAndGet();
                }
                return null;
            });
        }

        try (ExecutorService virtualExecutor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Void>> futures = virtualExecutor.invokeAll(tasks);
            for (Future<Void> future : futures) {
                future.get();
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Burst simulation interrupted", ex);
        } catch (ExecutionException ex) {
            throw new IllegalStateException("Burst simulation task failed", ex);
        }

        FlashCampaignDto after = catalogApi.findById(request.campaignId())
            .orElseThrow(() -> new IllegalArgumentException("Unknown campaignId"));

        int totalAccounted = after.remainingStock() + after.reservedStock() + after.settledStock();
        int oversellCount = Math.max(0, (after.reservedStock() + after.settledStock()) - after.initialAllocation());
        boolean invariantPreserved = totalAccounted == after.initialAllocation()
            && after.remainingStock() >= 0
            && oversellCount == 0;
        long durationMs = Math.max(1L, (System.nanoTime() - startNs) / 1_000_000L);

        return new BurstSimulationResponseDto(
            request.campaignId().toString(),
            request.concurrentBuyers(),
            reservedSuccess.get(),
            rejectedOutOfStock.get(),
            after.remainingStock(),
            oversellCount,
            invariantPreserved,
            durationMs
        );
    }

    @Transactional
    public void resetAllDemoState() {
        confirmIdempotencyCache.clear();
        orderRepository.deleteAllInBatch();
        settlementApi.resetLedger();
        catalogApi.resetDemoCatalog();
    }

    private OrderSnapshotDto toSnapshot(OrderEntity entity, boolean idempotentReplay) {
        SettlementReceiptDto receipt = null;
        if (entity.getStatus() == OrderStatus.SETTLED && entity.getTransactionId() != null) {
            receipt = new SettlementReceiptDto(
                entity.getTransactionId(),
                SettlementLedgerService.BUYER_CLEARING_ACCOUNT,
                SettlementLedgerService.MERCHANT_REVENUE_ACCOUNT,
                entity.getTotalAmountCents(),
                entity.getTotalAmountCents(),
                true,
                entity.getSettledAtIso()
            );
        }
        return new OrderSnapshotDto(
            entity.getOrderId(),
            entity.getCampaignId(),
            entity.getSkuCode(),
            entity.getBuyerId(),
            entity.getQuantity(),
            entity.getTotalAmountCents(),
            entity.getCurrency(),
            entity.getStatus().name(),
            entity.getIdempotencyKey(),
            idempotentReplay,
            entity.getExpiresAtEpochMs(),
            contractVersion,
            receipt
        );
    }
}
