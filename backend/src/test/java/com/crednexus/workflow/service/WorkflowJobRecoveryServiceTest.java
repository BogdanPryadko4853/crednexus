package com.crednexus.workflow.service;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.company.entity.Company;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.entity.WorkflowJobType;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class WorkflowJobRecoveryServiceTest {

    @Mock private WorkflowJobRepository workflowJobRepository;
    @Mock private LoanApplicationRepository loanApplicationRepository;
    @Mock private WorkflowService workflowService;

    @Test
    void schedulesRetryBeforeMaximumAttempts() {
        UUID jobId = UUID.randomUUID();
        WorkflowJob job = job(application(), 1);
        when(workflowJobRepository.findByIdForUpdate(jobId)).thenReturn(Optional.of(job));
        WorkflowJobRecoveryService service = new WorkflowJobRecoveryService(
                workflowJobRepository, loanApplicationRepository, workflowService);

        service.recover(jobId, "temporary error");

        verify(loanApplicationRepository, never()).findByIdForUpdate(org.mockito.ArgumentMatchers.any());
        org.assertj.core.api.Assertions.assertThat(job.getStatus().name()).isEqualTo("RETRY_SCHEDULED");
    }

    @Test
    void routesToManualReviewAfterMaximumAttempts() {
        UUID jobId = UUID.randomUUID();
        LoanApplication application = application();
        WorkflowJob job = job(application, 3);
        when(workflowJobRepository.findByIdForUpdate(jobId)).thenReturn(Optional.of(job));
        when(loanApplicationRepository.findByIdForUpdate(application.getId())).thenReturn(Optional.of(application));
        WorkflowJobRecoveryService service = new WorkflowJobRecoveryService(
                workflowJobRepository, loanApplicationRepository, workflowService);

        service.recover(jobId, "permanent error");

        verify(workflowService).transition(application, LoanApplicationStatus.MANUAL_REVIEW, null, "permanent error");
        org.assertj.core.api.Assertions.assertThat(job.getStatus().name()).isEqualTo("FAILED");
    }

    private WorkflowJob job(LoanApplication application, int attempts) {
        WorkflowJob job = new WorkflowJob(application, WorkflowJobType.SCORING, 3);
        for (int index = 0; index < attempts; index++) job.claim(Instant.now());
        return job;
    }

    private LoanApplication application() {
        LoanApplication application = new LoanApplication(
                new Company("7701234500", "1027700132195", "Test", "OOO", "ACTIVE"),
                new User("user", "user@test.local", "Test User"),
                new CreditProduct("Product", new BigDecimal("10000"), new BigDecimal("5000000"), 6, 60,
                        new BigDecimal("15"), true),
                new BigDecimal("100000"), 12, "Purpose");
        ReflectionTestUtils.setField(application, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(application, "status", LoanApplicationStatus.SCORING);
        return application;
    }
}
