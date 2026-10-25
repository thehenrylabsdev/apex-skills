package com.thehenrylabs.apexledger.settlement;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SettlementLedgerService implements SettlementPublicApi {

    public static final String BUYER_CLEARING_ACCOUNT = "1100-BUYER-CLEARING";
    public static final String MERCHANT_REVENUE_ACCOUNT = "4000-MERCHANT-REVENUE";

    private final LedgerPostingRepository ledgerPostingRepository;
    private final SettlementMapper settlementMapper;
    private final AtomicLong txnSequence = new AtomicLong(99000L);

    @Value("${apex.contract-version:2026-10-25}")
    private String contractVersion;

    @Value("${apex.environment:LOCAL}")
    private String environment;

    @Override
    @Transactional
    public SettlementReceiptDto postDoubleEntrySettlement(UUID orderId, long amountCents) {
        if (amountCents <= 0) {
            throw new IllegalArgumentException("Settlement amountCents must be positive.");
        }

        List<LedgerPostingEntity> existing = ledgerPostingRepository.findByOrderIdOrderByDirectionAsc(
            orderId.toString()
        );
        if (existing.size() == 2) {
            LedgerPostingEntity first = existing.get(0);
            return new SettlementReceiptDto(
                first.getTransactionId(),
                BUYER_CLEARING_ACCOUNT,
                MERCHANT_REVENUE_ACCOUNT,
                amountCents,
                amountCents,
                true,
                first.getCreatedAtIso()
            );
        }

        String transactionId = "TXN-LEDGER-" + txnSequence.incrementAndGet();
        String nowIso = Instant.now().toString();

        LedgerPostingEntity debit = LedgerPostingEntity.builder()
            .entryId(UUID.randomUUID().toString())
            .orderId(orderId.toString())
            .transactionId(transactionId)
            .direction("DEBIT")
            .accountCode(BUYER_CLEARING_ACCOUNT)
            .amountCents(amountCents)
            .createdAtIso(nowIso)
            .build();

        LedgerPostingEntity credit = LedgerPostingEntity.builder()
            .entryId(UUID.randomUUID().toString())
            .orderId(orderId.toString())
            .transactionId(transactionId)
            .direction("CREDIT")
            .accountCode(MERCHANT_REVENUE_ACCOUNT)
            .amountCents(amountCents)
            .createdAtIso(nowIso)
            .build();

        ledgerPostingRepository.saveAllAndFlush(List.of(debit, credit));

        return new SettlementReceiptDto(
            transactionId,
            BUYER_CLEARING_ACCOUNT,
            MERCHANT_REVENUE_ACCOUNT,
            debit.getAmountCents(),
            credit.getAmountCents(),
            debit.getAmountCents() - credit.getAmountCents() == 0L,
            nowIso
        );
    }

    @Override
    @Transactional(readOnly = true)
    public LedgerSummaryDto getLedgerSummary() {
        List<LedgerPostingEntryDto> entries = ledgerPostingRepository.findAll().stream()
            .map(settlementMapper::toDto)
            .toList();

        long totalDebit = entries.stream()
            .filter(e -> "DEBIT".equals(e.direction()))
            .mapToLong(LedgerPostingEntryDto::amountCents)
            .sum();

        long totalCredit = entries.stream()
            .filter(e -> "CREDIT".equals(e.direction()))
            .mapToLong(LedgerPostingEntryDto::amountCents)
            .sum();

        long netBalance = totalDebit - totalCredit;
        int settledOrdersCount = entries.size() / 2;

        return new LedgerSummaryDto(
            contractVersion,
            environment,
            totalDebit,
            totalCredit,
            netBalance,
            netBalance == 0L,
            settledOrdersCount,
            entries
        );
    }

    @Override
    @Transactional
    public void resetLedger() {
        ledgerPostingRepository.deleteAllInBatch();
    }
}
