package com.crednexus.application.repository;

import com.crednexus.application.entity.LoanApplication;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoanApplicationRepository extends JpaRepository<LoanApplication, UUID> {
}
