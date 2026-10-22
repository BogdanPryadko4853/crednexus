package com.crednexus.application.repository;

import com.crednexus.application.entity.InformationRequest;
import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

public interface InformationRequestRepository extends JpaRepository<InformationRequest, UUID> {
    List<InformationRequest> findAllByApplication_IdOrderByIdDesc(UUID applicationId);
    boolean existsByApplication_IdAndStatus(UUID applicationId, com.crednexus.application.entity.InformationRequestStatus status);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    java.util.Optional<InformationRequest> findByIdAndApplication_Id(UUID id, UUID applicationId);
}
