package com.thehenrylabs.apexledger.ordering;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "flash_orders")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderEntity {

    @Id
    @Column(name = "order_id", nullable = false, updatable = false)
    private UUID orderId;

    @Column(name = "campaign_id", nullable = false)
    private UUID campaignId;

    @Column(name = "sku_code", nullable = false)
    private String skuCode;

    @Column(name = "buyer_id", nullable = false)
    private String buyerId;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "total_amount_cents", nullable = false)
    private long totalAmountCents;

    @Column(name = "currency", nullable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private OrderStatus status;

    @Column(name = "idempotency_key", nullable = false, unique = true)
    private String idempotencyKey;

    @Column(name = "expires_at_epoch_ms", nullable = false)
    private long expiresAtEpochMs;

    @Column(name = "transaction_id")
    private String transactionId;

    @Column(name = "settled_at_iso")
    private String settledAtIso;

    @Version
    @Column(name = "version")
    private Long version;
}
