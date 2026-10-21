package com.crednexus.workflow.service;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.workflow.entity.*; import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.time.*; import java.util.*;
import org.springframework.stereotype.Service; import org.springframework.transaction.annotation.Transactional;
@Service public class WorkflowJobService {
 private static final int MAX_ATTEMPTS=3; private final WorkflowJobRepository repository;
 public WorkflowJobService(WorkflowJobRepository repository){this.repository=repository;}
 @Transactional public void enqueueVerification(LoanApplication application){ if(!repository.existsByApplication_IdAndJobTypeAndStatusIn(application.getId(),WorkflowJobType.VERIFICATION,List.of(WorkflowJobStatus.PENDING,WorkflowJobStatus.PROCESSING,WorkflowJobStatus.RETRY_SCHEDULED))) repository.save(new WorkflowJob(application,WorkflowJobType.VERIFICATION,MAX_ATTEMPTS)); }
 @Transactional public List<UUID> claimReadyJobs(Duration lease){ List<UUID> ids=repository.findReadyIdsForUpdate(10); Instant until=Instant.now().plus(lease); ids.forEach(id->repository.findByIdForUpdate(id).orElseThrow().claim(until)); return ids; }
 @Transactional public void retry(UUID id,Duration delay,String error){ repository.findByIdForUpdate(id).orElseThrow().retryAt(Instant.now().plus(delay),error); }
 @Transactional public void complete(UUID id){repository.findByIdForUpdate(id).orElseThrow().complete();}
 @Transactional public void fail(UUID id,String error){repository.findByIdForUpdate(id).orElseThrow().fail(error);}
}
