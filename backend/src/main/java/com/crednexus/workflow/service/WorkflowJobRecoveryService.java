package com.crednexus.workflow.service;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.entity.WorkflowJobStatus;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.util.UUID;
import java.time.Duration;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkflowJobRecoveryService {

    private final WorkflowJobRepository workflowJobRepository;
    private final LoanApplicationRepository loanApplicationRepository;
    private final WorkflowService workflowService;

    public WorkflowJobRecoveryService(
            WorkflowJobRepository workflowJobRepository,
            LoanApplicationRepository loanApplicationRepository,
            WorkflowService workflowService
    ) {
        this.workflowJobRepository = workflowJobRepository;
        this.loanApplicationRepository = loanApplicationRepository;
        this.workflowService = workflowService;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recover(UUID jobId, String error) {
        WorkflowJob job = workflowJobRepository.findByIdForUpdate(jobId).orElseThrow();
        if (job.getStatus() == WorkflowJobStatus.COMPLETED || job.getStatus() == WorkflowJobStatus.FAILED) {
            return;
        }
        if (job.getAttempts() < job.getMaxAttempts()) {
            job.retryAt(java.time.Instant.now().plus(Duration.ofSeconds(5)), error);
            return;
        }
        LoanApplication application = loanApplicationRepository.findByIdForUpdate(job.getApplication().getId()).orElseThrow();
        if (application.getStatus() == LoanApplicationStatus.VERIFYING
                || application.getStatus() == LoanApplicationStatus.SCORING) {
            workflowService.transition(application, LoanApplicationStatus.MANUAL_REVIEW, null, error);
        }
        job.fail(error);
    }
}
