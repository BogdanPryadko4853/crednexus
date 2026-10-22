package com.crednexus.verification.repository;

import com.crednexus.verification.entity.VerificationResult;
import com.crednexus.verification.entity.VerificationType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VerificationResultRepository extends JpaRepository<VerificationResult, UUID> {

    Optional<VerificationResult> findTopByApplication_IdAndTypeOrderByCheckedAtDesc(UUID applicationId, VerificationType type);

    long countByApplication_IdAndType(UUID applicationId, VerificationType type);

    List<VerificationResult> findAllByApplication_IdOrderByCheckedAtAsc(UUID applicationId);
}
