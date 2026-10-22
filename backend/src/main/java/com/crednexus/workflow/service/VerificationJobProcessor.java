package com.crednexus.workflow.service;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.entity.InformationRequest;
import com.crednexus.application.entity.InformationRequestStatus;
import com.crednexus.application.repository.InformationRequestRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.verification.entity.VerificationResult;
import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.service.VerificationService;
import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.time.Duration;
import java.util.Map;
import java.util.List;
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
    private final InformationRequestRepository informationRequestRepository;

    public VerificationJobProcessor(WorkflowJobRepository workflowJobRepository, LoanApplicationRepository loanApplicationRepository,
                                    VerificationService verificationService, WorkflowJobService workflowJobService,
                                    WorkflowService workflowService, InformationRequestRepository informationRequestRepository) {
        this.workflowJobRepository = workflowJobRepository;
        this.loanApplicationRepository = loanApplicationRepository;
        this.verificationService = verificationService;
        this.workflowJobService = workflowJobService;
        this.workflowService = workflowService;
        this.informationRequestRepository = informationRequestRepository;
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
            createInformationRequests(application, latest);
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

    private void createInformationRequests(LoanApplication application,
                                           Map<VerificationType, VerificationResult> latestResults) {
        latestResults.forEach((type, result) -> {
            if (!"NEEDS_INFO".equals(result.getPayload().get("outcome"))) {
                return;
            }
            Object missingFields = result.getPayload().get("missingFields");
            if (!(missingFields instanceof List<?> fields)) {
                return;
            }
            for (Object field : fields) {
                if (!(field instanceof String code) || code.isBlank()) {
                    continue;
                }
                informationRequestRepository
                        .findByApplication_IdAndVerificationTypeAndRequirementCodeAndStatus(
                                application.getId(), type, code, InformationRequestStatus.OPEN)
                        .orElseGet(() -> informationRequestRepository.save(new InformationRequest(
                                application, question(type, code), type, code, requiresDocument(code)
                        )));
            }
        });
    }

    private boolean requiresDocument(String requirementCode) {
        return "registrationDocument".equals(requirementCode);
    }

    private String question(VerificationType type, String requirementCode) {
        if (type == VerificationType.TAX_SERVICE && "registrationDocument".equals(requirementCode)) {
            return "Приложите документ, подтверждающий регистрацию компании.";
        }
        if (type == VerificationType.CREDIT_BUREAU && "consentToCreditHistoryCheck".equals(requirementCode)) {
            return "Подтвердите согласие на проверку кредитной истории в текстовом поле.";
        }
        return "Предоставьте дополнительную информацию для проверки: " + requirementCode;
    }
}
