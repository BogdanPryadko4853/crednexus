package com.crednexus.workflow.service;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.workflow.entity.*; import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.time.*; import java.util.*;
import org.springframework.stereotype.Service; import org.springframework.transaction.annotation.Transactional;
@Service public class WorkflowJobService {
 private static final int MAX_ATTEMPTS=3; private final WorkflowJobRepository repository;
 public WorkflowJobService(WorkflowJobRepository repository){this.repository=repository;}
 @Transactional public void enqueueVerification(LoanApplication application){ enqueue(application,WorkflowJobType.VERIFICATION); }
 @Transactional public void enqueueScoring(LoanApplication application){ enqueue(application,WorkflowJobType.SCORING); }
 @Transactional public void enqueueDecision(LoanApplication application){ enqueue(application,WorkflowJobType.DECISION); }
 @Transactional public void enqueueOfferExpiration(LoanApplication application, Instant expiresAt){ if(!repository.existsByApplication_IdAndJobTypeAndStatusIn(application.getId(),WorkflowJobType.OFFER_EXPIRATION,List.of(WorkflowJobStatus.PENDING,WorkflowJobStatus.PROCESSING,WorkflowJobStatus.RETRY_SCHEDULED))) repository.save(new WorkflowJob(application,WorkflowJobType.OFFER_EXPIRATION,MAX_ATTEMPTS,expiresAt)); }
 @Transactional public List<UUID> claimReadyJobs(WorkflowJobType type, Duration lease){ List<UUID> ids=repository.findReadyIdsForUpdate(type.name(),1); Instant until=Instant.now().plus(lease); ids.forEach(id->repository.findByIdForUpdate(id).orElseThrow().claim(until)); return ids; }
 @Transactional public void retry(UUID id,Duration delay,String error){ repository.findByIdForUpdate(id).orElseThrow().retryAt(Instant.now().plus(delay),error); }
 @Transactional public void complete(UUID id){repository.findByIdForUpdate(id).orElseThrow().complete();}
 @Transactional public void fail(UUID id,String error){repository.findByIdForUpdate(id).orElseThrow().fail(error);}
 private void enqueue(LoanApplication application, WorkflowJobType type){ if(!repository.existsByApplication_IdAndJobTypeAndStatusIn(application.getId(),type,List.of(WorkflowJobStatus.PENDING,WorkflowJobStatus.PROCESSING,WorkflowJobStatus.RETRY_SCHEDULED))) repository.save(new WorkflowJob(application,type,MAX_ATTEMPTS)); }
}
