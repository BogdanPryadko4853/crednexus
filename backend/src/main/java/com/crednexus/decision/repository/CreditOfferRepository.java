package com.crednexus.decision.repository;

import com.crednexus.decision.entity.CreditOffer;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditOfferRepository extends JpaRepository<CreditOffer, UUID> {
}
