package com.thehenrylabs.apexledger.catalog;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CatalogPublicApi {

    CampaignListResponseDto listCampaigns();

    Optional<FlashCampaignDto> findById(UUID campaignId);

    StockReservationOutcome tryReserveStock(UUID campaignId, int quantity);

    void confirmSettledStock(UUID campaignId, int quantity);

    void releaseReservedStock(UUID campaignId, int quantity);

    void resetDemoCatalog();
}
