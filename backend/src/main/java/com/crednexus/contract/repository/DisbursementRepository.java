package com.crednexus.contract.repository;

import com.crednexus.contract.entity.Disbursement;
import java.util.UUID;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DisbursementRepository extends JpaRepository<Disbursement, UUID> {

    Optional<Disbursement> findFirstByAgreement_Offer_Decision_Application_Id(UUID applicationId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Disbursement> findByAgreement_Offer_Decision_Application_Id(UUID applicationId);
}
