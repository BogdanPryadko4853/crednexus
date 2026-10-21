package com.crednexus.verification.service;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.verification.dto.VerificationResultResponse;
import com.crednexus.verification.dto.VerificationRunResponse;
import com.crednexus.verification.entity.VerificationResult;
import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.mock.CreditBureauMock;
import com.crednexus.verification.mock.MockVerificationOutcome;
import com.crednexus.verification.mock.TaxServiceMock;
import com.crednexus.verification.repository.VerificationResultRepository;
import com.crednexus.workflow.service.WorkflowService;
import com.crednexus.workflow.service.WorkflowJobService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.EnumMap;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VerificationService {

    private static final int MAX_ATTEMPTS = 3;

    private final LoanApplicationRepository loanApplicationRepository;
    private final VerificationResultRepository verificationResultRepository;
    private final WorkflowService workflowService;
    private final CurrentUserProvider currentUserProvider;
    private final TaxServiceMock taxServiceMock;
    private final CreditBureauMock creditBureauMock;
    private final WorkflowJobService workflowJobService;
    private final CompanyMemberRepository companyMemberRepository;

    public VerificationService(
            LoanApplicationRepository loanApplicationRepository,
            VerificationResultRepository verificationResultRepository,
            WorkflowService workflowService,
            CurrentUserProvider currentUserProvider,
            TaxServiceMock taxServiceMock,
            CreditBureauMock creditBureauMock, WorkflowJobService workflowJobService, CompanyMemberRepository companyMemberRepository
    ) {
        this.loanApplicationRepository = loanApplicationRepository;
        this.verificationResultRepository = verificationResultRepository;
        this.workflowService = workflowService;
        this.currentUserProvider = currentUserProvider;
        this.taxServiceMock = taxServiceMock;
        this.creditBureauMock = creditBureauMock;
        this.workflowJobService = workflowJobService;
        this.companyMemberRepository = companyMemberRepository;
    }

    @Transactional
    public VerificationRunResponse runVerifications(UUID applicationId) {
        return runVerifications(applicationId, currentUserProvider.getCurrentUser());
    }

    @Transactional
    public void requestVerification(UUID applicationId) {
        LoanApplication application = loanApplicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        if (application.getStatus() != LoanApplicationStatus.SUBMITTED
                && application.getStatus() != LoanApplicationStatus.VERIFYING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Verifications cannot run for this application status");
        }
        workflowJobService.enqueueVerification(application);
    }

    @Transactional(readOnly = true)
    public List<VerificationResultResponse> getVerificationResults(UUID applicationId) {
        LoanApplication application = loanApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        User user = currentUserProvider.getCurrentUser();
        companyMemberRepository.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId())
                .filter(CompanyMember::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company access is denied"));
        return verificationResultRepository.findAllByApplication_IdOrderByCheckedAtAsc(applicationId).stream().map(this::toResponse).toList();
    }

    @Transactional
    public VerificationRunResponse runAutomatedVerifications(UUID applicationId) {
        return runVerifications(applicationId, null);
    }

    @Transactional(readOnly = true)
    public Map<VerificationType, VerificationResult> getLatestResults(UUID applicationId) {
        Map<VerificationType, VerificationResult> results = new EnumMap<>(VerificationType.class);
        for (VerificationType type : VerificationType.values()) {
            verificationResultRepository.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(applicationId, type)
                    .ifPresent(result -> results.put(type, result));
        }
        return results;
    }

    private VerificationRunResponse runVerifications(UUID applicationId, User currentUser) {
        LoanApplication application = loanApplicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        boolean initialRun = startVerificationIfSubmitted(application, currentUser);

        List<VerificationResultResponse> results = new ArrayList<>();
        runIfEligible(
                application,
                VerificationType.TAX_SERVICE,
                "mock-fns",
                () -> taxServiceMock.verify(application.getCompany()),
                initialRun,
                results
        );
        runIfEligible(
                application,
                VerificationType.CREDIT_BUREAU,
                "mock-bki",
                () -> creditBureauMock.verify(application.getCompany()),
                initialRun,
                results
        );

        if (results.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No verifications are eligible for execution");
        }

        return new VerificationRunResponse(application.getId(), application.getStatus(), results);
    }

    private boolean startVerificationIfSubmitted(LoanApplication application, User currentUser) {
        if (application.getStatus() == LoanApplicationStatus.SUBMITTED) {
            workflowService.transition(application, LoanApplicationStatus.VERIFYING, currentUser);
            return true;
        }
        if (application.getStatus() != LoanApplicationStatus.VERIFYING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Verifications can only run for submitted or verifying applications"
            );
        }
        return false;
    }

    private void runIfEligible(
            LoanApplication application,
            VerificationType type,
            String source,
            Supplier<MockVerificationOutcome> verification,
            boolean initialRun,
            List<VerificationResultResponse> results
    ) {
        VerificationResult latestResult = verificationResultRepository
                .findTopByApplication_IdAndTypeOrderByCheckedAtDesc(application.getId(), type)
                .orElse(null);
        if (!initialRun && latestResult != null && latestResult.getStatus() != VerificationStatus.ERROR) {
            return;
        }

        long attempts = verificationResultRepository.countByApplication_IdAndType(application.getId(), type);
        if (attempts >= MAX_ATTEMPTS) {
            return;
        }

        MockVerificationOutcome outcome;
        try {
            outcome = verification.get();
        } catch (RuntimeException exception) {
            outcome = new MockVerificationOutcome(VerificationStatus.ERROR, new LinkedHashMap<>());
            outcome.payload().put("outcome", "ERROR");
            outcome.payload().put("errorCode", "MOCK_UNEXPECTED_ERROR");
            outcome.payload().put("message", "Техническая ошибка mock-проверки");
        }

        MapWithAttempt payload = withAttempt(outcome, attempts + 1);
        VerificationResult result = verificationResultRepository.save(new VerificationResult(
                application,
                type,
                outcome.status(),
                source,
                payload.value(),
                Instant.now()
        ));
        results.add(toResponse(result));
    }

    private MapWithAttempt withAttempt(MockVerificationOutcome outcome, long attempt) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>(outcome.payload());
        payload.put("attempt", attempt);
        return new MapWithAttempt(payload);
    }

    private VerificationResultResponse toResponse(VerificationResult result) {
        return new VerificationResultResponse(
                result.getId(),
                result.getType(),
                result.getStatus(),
                result.getSource(),
                result.getPayload(),
                result.getCheckedAt()
        );
    }

    private record MapWithAttempt(LinkedHashMap<String, Object> value) {
    }
}
