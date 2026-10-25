package com.thehenrylabs.apexledger.settlement;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LedgerPostingRepository extends JpaRepository<LedgerPostingEntity, String> {

    List<LedgerPostingEntity> findByOrderIdOrderByDirectionAsc(String orderId);
}
