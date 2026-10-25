package com.thehenrylabs.apexledger.ordering;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<OrderEntity, UUID> {

    Optional<OrderEntity> findByIdempotencyKey(String idempotencyKey);
}
