package com.crednexus.contract.repository;

import com.crednexus.contract.entity.LoanAgreement;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoanAgreementRepository extends JpaRepository<LoanAgreement, UUID> {
}
