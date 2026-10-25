package com.thehenrylabs.apexledger.settlement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "ledger_postings")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LedgerPostingEntity {

    @Id
    @Column(name = "entry_id", nullable = false, updatable = false)
    private String entryId;

    @Column(name = "order_id", nullable = false)
    private String orderId;

    @Column(name = "transaction_id", nullable = false)
    private String transactionId;

    @Column(name = "direction", nullable = false)
    private String direction;

    @Column(name = "account_code", nullable = false)
    private String accountCode;

    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    @Column(name = "created_at_iso", nullable = false)
    private String createdAtIso;
}
