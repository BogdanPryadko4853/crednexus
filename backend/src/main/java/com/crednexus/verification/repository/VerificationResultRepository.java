package com.crednexus.verification.repository;

import com.crednexus.verification.entity.VerificationResult;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VerificationResultRepository extends JpaRepository<VerificationResult, UUID> {
}
