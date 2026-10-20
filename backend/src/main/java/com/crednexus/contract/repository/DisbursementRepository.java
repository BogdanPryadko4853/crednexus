package com.crednexus.contract.repository;

import com.crednexus.contract.entity.Disbursement;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DisbursementRepository extends JpaRepository<Disbursement, UUID> {
}
