package com.crednexus.workflow.repository;
import com.crednexus.workflow.entity.*;
import java.time.Instant; import java.util.*;
import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param;
public interface WorkflowJobRepository extends JpaRepository<WorkflowJob, UUID> {
 boolean existsByApplication_IdAndJobTypeAndStatusIn(UUID applicationId, WorkflowJobType type, Collection<WorkflowJobStatus> statuses);
 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
 @Query("select j from WorkflowJob j where j.id=:id") Optional<WorkflowJob> findByIdForUpdate(@Param("id") UUID id);
 @Query(value="select id from workflow_jobs where (status in ('PENDING','RETRY_SCHEDULED') and available_at<=now()) or (status='PROCESSING' and locked_until<now()) order by available_at for update skip locked limit :limit", nativeQuery=true)
 List<UUID> findReadyIdsForUpdate(@Param("limit") int limit);
}
