package com.thehenrylabs.apexledger.catalog;

import jakarta.annotation.PostConstruct;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CatalogService implements CatalogPublicApi {

    private final FlashCampaignRepository campaignRepository;
    private final CatalogMapper catalogMapper;
    private final ReentrantLock stockLock = new ReentrantLock(true);

    @Value("${apex.contract-version:2026-10-25}")
    private String contractVersion;

    @Value("${apex.environment:LOCAL}")
    private String environment;

    @PostConstruct
    @Transactional
    public void initDefaultCatalog() {
        if (campaignRepository.count() == 0) {
            seedCanonicalCampaigns();
        }
    }

    @Override
    @Transactional(readOnly = true)
    public CampaignListResponseDto listCampaigns() {
        List<FlashCampaignDto> items = campaignRepository.findAll().stream()
            .sorted(Comparator.comparing(FlashCampaignEntity::getSkuCode))
            .map(catalogMapper::toDto)
            .toList();
        return new CampaignListResponseDto(contractVersion, environment, items);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<FlashCampaignDto> findById(UUID campaignId) {
        return campaignRepository.findById(campaignId).map(catalogMapper::toDto);
    }

    @Override
    @Transactional
    public StockReservationOutcome tryReserveStock(UUID campaignId, int quantity) {
        stockLock.lock();
        try {
            FlashCampaignEntity entity = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown campaignId: " + campaignId));

            if (quantity <= 0) {
                return new StockReservationOutcome(
                    false,
                    catalogMapper.toDto(entity),
                    "Quantity must be positive."
                );
            }

            if (entity.getRemainingStock() < quantity) {
                return new StockReservationOutcome(
                    false,
                    catalogMapper.toDto(entity),
                    "Requested quantity (" + quantity + ") exceeds remaining flash allocation ("
                        + entity.getRemainingStock() + ") for SKU " + entity.getSkuCode() + "."
                );
            }

            entity.setRemainingStock(entity.getRemainingStock() - quantity);
            entity.setReservedStock(entity.getReservedStock() + quantity);
            if (entity.getRemainingStock() == 0 && entity.getReservedStock() == 0) {
                entity.setStatus("SOLD_OUT");
            }
            FlashCampaignEntity saved = campaignRepository.saveAndFlush(entity);
            assertInventoryConservation(saved);
            return new StockReservationOutcome(true, catalogMapper.toDto(saved), null);
        } finally {
            stockLock.unlock();
        }
    }

    @Override
    @Transactional
    public void confirmSettledStock(UUID campaignId, int quantity) {
        stockLock.lock();
        try {
            FlashCampaignEntity entity = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown campaignId: " + campaignId));
            entity.setReservedStock(Math.max(0, entity.getReservedStock() - quantity));
            entity.setSettledStock(entity.getSettledStock() + quantity);
            if (entity.getRemainingStock() == 0 && entity.getReservedStock() == 0) {
                entity.setStatus("SOLD_OUT");
            }
            FlashCampaignEntity saved = campaignRepository.saveAndFlush(entity);
            assertInventoryConservation(saved);
        } finally {
            stockLock.unlock();
        }
    }

    @Override
    @Transactional
    public void releaseReservedStock(UUID campaignId, int quantity) {
        stockLock.lock();
        try {
            FlashCampaignEntity entity = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown campaignId: " + campaignId));
            entity.setReservedStock(Math.max(0, entity.getReservedStock() - quantity));
            entity.setRemainingStock(entity.getRemainingStock() + quantity);
            if (entity.getRemainingStock() > 0) {
                entity.setStatus("ACTIVE");
            }
            FlashCampaignEntity saved = campaignRepository.saveAndFlush(entity);
            assertInventoryConservation(saved);
        } finally {
            stockLock.unlock();
        }
    }

    @Override
    @Transactional
    public void resetDemoCatalog() {
        stockLock.lock();
        try {
            campaignRepository.deleteAllInBatch();
            seedCanonicalCampaigns();
        } finally {
            stockLock.unlock();
        }
    }

    private void seedCanonicalCampaigns() {
        FlashCampaignEntity h200 = FlashCampaignEntity.builder()
            .campaignId(UUID.fromString("11111111-1111-4111-8111-111111111101"))
            .skuCode("APEX-H200-NODE")
            .title("NVIDIA H200 Tensor Core Compute Cluster Slice")
            .subtitle("Dedicated 141GB HBM3e NVLink Flash Allocation")
            .unitPriceCents(249900L)
            .currency("USD")
            .initialAllocation(10)
            .remainingStock(10)
            .reservedStock(0)
            .settledStock(0)
            .status("ACTIVE")
            .build();

        FlashCampaignEntity quantumKey = FlashCampaignEntity.builder()
            .campaignId(UUID.fromString("11111111-1111-4111-8111-111111111102"))
            .skuCode("APEX-QUANTUM-KEY")
            .title("YubiKey FIPS Post-Quantum Hardware Vault")
            .subtitle("Institutional HSM Signing Key Pair Drop")
            .unitPriceCents(49900L)
            .currency("USD")
            .initialAllocation(25)
            .remainingStock(25)
            .reservedStock(0)
            .settledStock(0)
            .status("ACTIVE")
            .build();

        FlashCampaignEntity chronoTi = FlashCampaignEntity.builder()
            .campaignId(UUID.fromString("11111111-1111-4111-8111-111111111103"))
            .skuCode("APEX-CHRONO-TI")
            .title("Apex Grade-5 Titanium Atomic Field Chronograph")
            .subtitle("Numbered Collector Edition (100m Hermetic Seal)")
            .unitPriceCents(189900L)
            .currency("USD")
            .initialAllocation(5)
            .remainingStock(0)
            .reservedStock(0)
            .settledStock(5)
            .status("SOLD_OUT")
            .build();

        campaignRepository.saveAllAndFlush(List.of(h200, quantumKey, chronoTi));
    }

    private static void assertInventoryConservation(FlashCampaignEntity entity) {
        int sum = entity.getRemainingStock() + entity.getReservedStock() + entity.getSettledStock();
        if (sum != entity.getInitialAllocation() || entity.getRemainingStock() < 0) {
            throw new IllegalStateException(
                "Inventory conservation invariant violated for SKU " + entity.getSkuCode()
            );
        }
    }
}
