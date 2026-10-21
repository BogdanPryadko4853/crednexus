package com.crednexus.workflow.service;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.verification.entity.VerificationResult;
import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.service.VerificationService;
import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VerificationJobProcessor {

    private final WorkflowJobRepository workflowJobRepository;
    private final LoanApplicationRepository loanApplicationRepository;
    private final VerificationService verificationService;
    private final WorkflowJobService workflowJobService;
    private final WorkflowService workflowService;

    public VerificationJobProcessor(WorkflowJobRepository workflowJobRepository, LoanApplicationRepository loanApplicationRepository,
                                    VerificationService verificationService, WorkflowJobService workflowJobService,
                                    WorkflowService workflowService) {
        this.workflowJobRepository = workflowJobRepository;
        this.loanApplicationRepository = loanApplicationRepository;
        this.verificationService = verificationService;
        this.workflowJobService = workflowJobService;
        this.workflowService = workflowService;
    }

    @Transactional
    public void process(UUID jobId) {
        WorkflowJob job = workflowJobRepository.findByIdForUpdate(jobId).orElseThrow();
        UUID applicationId = job.getApplication().getId();
        verificationService.runAutomatedVerifications(applicationId);
        LoanApplication application = loanApplicationRepository.findByIdForUpdate(applicationId).orElseThrow();
        Map<VerificationType, VerificationResult> latest = verificationService.getLatestResults(applicationId);
        if (hasStatus(latest, VerificationStatus.ERROR)) {
            String reason = "Техническая ошибка проверки ФНС или БКИ";
            if (job.getAttempts() >= job.getMaxAttempts()) {
                workflowService.transition(application, LoanApplicationStatus.MANUAL_REVIEW, null, reason);
                job.fail(reason);
            } else {
                workflowJobService.retry(jobId, Duration.ofSeconds(5), reason);
            }
            return;
        }
        if (latest.size() != VerificationType.values().length) {
            String reason = "Не получены результаты всех обязательных проверок";
            workflowService.transition(application, LoanApplicationStatus.MANUAL_REVIEW, null, reason);
            job.fail(reason);
            return;
        }
        if (hasStatus(latest, VerificationStatus.FAILED)) {
            workflowService.transition(application, LoanApplicationStatus.MANUAL_REVIEW, null,
                    "Отрицательный бизнес-результат проверки ФНС или БКИ");
            job.complete();
            return;
        }
        if (hasOutcome(latest, "NEEDS_INFO")) {
            workflowService.transition(application, LoanApplicationStatus.NEEDS_INFO, null,
                    "Требуются дополнительные сведения");
            job.complete();
            return;
        }
        workflowService.transition(application, LoanApplicationStatus.SCORING, null);
        job.complete();
        workflowJobService.enqueueScoring(application);
    }

    private boolean hasStatus(Map<VerificationType, VerificationResult> results, VerificationStatus status) {
        return results.values().stream().anyMatch(result -> result.getStatus() == status);
    }

    private boolean hasOutcome(Map<VerificationType, VerificationResult> results, String outcome) {
        return results.values().stream().anyMatch(result -> outcome.equals(result.getPayload().get("outcome")));
    }
}
