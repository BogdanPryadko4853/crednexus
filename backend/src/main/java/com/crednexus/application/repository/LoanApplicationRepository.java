package com.crednexus.application.repository;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LoanApplicationRepository extends JpaRepository<LoanApplication, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select application from LoanApplication application where application.id = :applicationId")
    Optional<LoanApplication> findByIdForUpdate(@Param("applicationId") UUID applicationId);

    @Query("""
            select application
            from LoanApplication application
            where exists (
                select 1
                from CompanyMember membership
                where membership.company = application.company
                    and membership.user.id = :userId
                    and membership.active = true
            )
            order by application.updatedAt desc
            """)
    List<LoanApplication> findAllAccessibleByUserId(@Param("userId") UUID userId);

    List<LoanApplication> findAllByStatusOrderByUpdatedAtAsc(LoanApplicationStatus status);
}
