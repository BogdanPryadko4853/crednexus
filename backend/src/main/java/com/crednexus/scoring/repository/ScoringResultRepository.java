package com.crednexus.scoring.repository;

import com.crednexus.scoring.entity.ScoringResult;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScoringResultRepository extends JpaRepository<ScoringResult, UUID> {

    Optional<ScoringResult> findTopByApplication_IdOrderByCalculatedAtDesc(UUID applicationId);
}
