package com.crednexus.decision.repository;

import com.crednexus.decision.entity.CreditDecision;
import java.util.Optional;
import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditDecisionRepository extends JpaRepository<CreditDecision, UUID> {

    Optional<CreditDecision> findTopByApplication_IdOrderByDecidedAtDesc(UUID applicationId);
    List<CreditDecision> findAllByApplication_IdOrderByDecidedAtDesc(UUID applicationId);
}
