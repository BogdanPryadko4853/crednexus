package com.crednexus.scoring.repository;

import com.crednexus.scoring.entity.MlScoringProfile;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MlScoringProfileRepository extends JpaRepository<MlScoringProfile, UUID> {
    Optional<MlScoringProfile> findByApplication_Id(UUID applicationId);
}
