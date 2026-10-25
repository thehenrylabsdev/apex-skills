package com.thehenrylabs.apexledger.settlement;

import java.util.UUID;

public interface SettlementPublicApi {

    SettlementReceiptDto postDoubleEntrySettlement(UUID orderId, long amountCents);

    LedgerSummaryDto getLedgerSummary();

    void resetLedger();
}
