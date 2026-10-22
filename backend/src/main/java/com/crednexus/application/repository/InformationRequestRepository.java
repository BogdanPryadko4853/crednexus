package com.crednexus.application.repository;

import com.crednexus.application.entity.InformationRequest;
import java.util.UUID;
import java.util.List;
import com.crednexus.application.entity.InformationRequestStatus;
import com.crednexus.verification.entity.VerificationType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

public interface InformationRequestRepository extends JpaRepository<InformationRequest, UUID> {
    List<InformationRequest> findAllByApplication_IdOrderByIdDesc(UUID applicationId);
    boolean existsByApplication_IdAndStatus(UUID applicationId, InformationRequestStatus status);
    java.util.Optional<InformationRequest> findByApplication_IdAndVerificationTypeAndRequirementCodeAndStatus(
            UUID applicationId, VerificationType verificationType, String requirementCode, InformationRequestStatus status);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    java.util.Optional<InformationRequest> findByIdAndApplication_Id(UUID id, UUID applicationId);
}
