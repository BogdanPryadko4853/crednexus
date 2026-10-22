package com.crednexus.contract.repository;

import com.crednexus.contract.entity.LoanAgreement;
import java.util.UUID;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoanAgreementRepository extends JpaRepository<LoanAgreement, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<LoanAgreement> findByOffer_Decision_Application_Id(UUID applicationId);
}
