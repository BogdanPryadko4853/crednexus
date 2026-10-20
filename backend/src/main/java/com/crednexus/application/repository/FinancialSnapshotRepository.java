package com.crednexus.application.repository;

import com.crednexus.application.entity.FinancialSnapshot;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FinancialSnapshotRepository extends JpaRepository<FinancialSnapshot, UUID> {
}
