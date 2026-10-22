package com.crednexus.decision.repository;

import com.crednexus.decision.entity.CreditDecision;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditDecisionRepository extends JpaRepository<CreditDecision, UUID> {

    Optional<CreditDecision> findTopByApplication_IdOrderByDecidedAtDesc(UUID applicationId);
}
