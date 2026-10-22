package com.crednexus.scoring.service;

import com.crednexus.application.entity.FinancialSnapshot;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.scoring.entity.ScoringResult;
import com.crednexus.scoring.provider.ScoringInput;
import com.crednexus.scoring.provider.ScoringOutput;
import com.crednexus.scoring.provider.ScoringProvider;
import com.crednexus.scoring.repository.ScoringResultRepository;
import com.crednexus.verification.entity.VerificationResult;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.repository.VerificationResultRepository;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ScoringService {

    private final LoanApplicationRepository loanApplicationRepository;
    private final FinancialSnapshotRepository financialSnapshotRepository;
    private final VerificationResultRepository verificationResultRepository;
    private final ScoringResultRepository scoringResultRepository;
    private final ScoringProvider scoringProvider;

    public ScoringService(
            LoanApplicationRepository loanApplicationRepository,
            FinancialSnapshotRepository financialSnapshotRepository,
            VerificationResultRepository verificationResultRepository,
            ScoringResultRepository scoringResultRepository,
            ScoringProvider scoringProvider
    ) {
        this.loanApplicationRepository = loanApplicationRepository;
        this.financialSnapshotRepository = financialSnapshotRepository;
        this.verificationResultRepository = verificationResultRepository;
        this.scoringResultRepository = scoringResultRepository;
        this.scoringProvider = scoringProvider;
    }

    @Transactional
    public ScoringResult calculate(UUID applicationId) {
        LoanApplication application = loanApplicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        if (application.getStatus() != LoanApplicationStatus.SCORING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Scoring cannot run for this application status");
        }
        FinancialSnapshot snapshot = financialSnapshotRepository.findByApplication_Id(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Financial snapshot is required"));
        ScoringOutput output = scoringProvider.score(toInput(application, snapshot));
        validate(output);
        return scoringResultRepository.save(new ScoringResult(
                application,
                output.score(),
                output.riskLevel(),
                output.factors(),
                output.modelVersion(),
                Instant.now()
        ));
    }

    private ScoringInput toInput(LoanApplication application, FinancialSnapshot snapshot) {
        Map<VerificationType, ScoringInput.VerificationData> verifications = new EnumMap<>(VerificationType.class);
        for (VerificationType type : VerificationType.values()) {
            verificationResultRepository.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(application.getId(), type)
                    .ifPresent(result -> verifications.put(type, toVerificationData(result)));
        }
        return new ScoringInput(
                application.getId(),
                application.getRequestedAmount(),
                application.getTermMonths(),
                new ScoringInput.FinancialData(
                        snapshot.getAnnualRevenue(), snapshot.getAnnualExpenses(), snapshot.getExistingDebt(),
                        snapshot.getMonthlyPayments(), snapshot.getEmployeeCount(), snapshot.getPeriod()
                ),
                Map.copyOf(verifications)
        );
    }

    private ScoringInput.VerificationData toVerificationData(VerificationResult result) {
        return new ScoringInput.VerificationData(result.getStatus(), result.getPayload());
    }

    private void validate(ScoringOutput output) {
        if (output == null || output.score() == null || output.score() < 0 || output.score() > 100
                || output.riskLevel() == null || output.factors() == null
                || output.modelVersion() == null || output.modelVersion().isBlank()) {
            throw new IllegalStateException("Scoring provider returned an invalid result");
        }
    }
}
