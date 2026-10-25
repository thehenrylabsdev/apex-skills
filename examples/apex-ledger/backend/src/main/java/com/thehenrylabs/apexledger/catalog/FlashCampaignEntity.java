package com.thehenrylabs.apexledger.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "flash_campaigns")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FlashCampaignEntity {

    @Id
    @Column(name = "campaign_id", nullable = false, updatable = false)
    private UUID campaignId;

    @Column(name = "sku_code", nullable = false, unique = true)
    private String skuCode;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "subtitle", nullable = false)
    private String subtitle;

    @Column(name = "unit_price_cents", nullable = false)
    private long unitPriceCents;

    @Column(name = "currency", nullable = false)
    private String currency;

    @Column(name = "initial_allocation", nullable = false)
    private int initialAllocation;

    @Column(name = "remaining_stock", nullable = false)
    private int remainingStock;

    @Column(name = "reserved_stock", nullable = false)
    private int reservedStock;

    @Column(name = "settled_stock", nullable = false)
    private int settledStock;

    @Column(name = "status", nullable = false)
    private String status;

    @Version
    @Column(name = "version")
    private Long version;
}
