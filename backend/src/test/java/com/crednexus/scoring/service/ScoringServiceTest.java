package com.crednexus.scoring.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.entity.FinancialSnapshot;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.company.entity.Company;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.scoring.entity.RiskLevel;
import com.crednexus.scoring.entity.ScoringResult;
import com.crednexus.scoring.provider.ScoringOutput;
import com.crednexus.scoring.provider.ScoringProvider;
import com.crednexus.scoring.repository.ScoringResultRepository;
import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.repository.VerificationResultRepository;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ScoringServiceTest {

    @Mock
    private LoanApplicationRepository loanApplicationRepository;

    @Mock
    private FinancialSnapshotRepository financialSnapshotRepository;

    @Mock
    private VerificationResultRepository verificationResultRepository;

    @Mock
    private ScoringResultRepository scoringResultRepository;

    @Mock
    private ScoringProvider scoringProvider;

    @Captor
    private ArgumentCaptor<ScoringResult> scoringResultCaptor;

    @InjectMocks
    private ScoringService scoringService;

    @Test
    void persistsProviderResultForApplicationInScoringStatus() {
        UUID applicationId = UUID.randomUUID();
        LoanApplication application = application(applicationId);
        FinancialSnapshot snapshot = new FinancialSnapshot(
                application,
                new BigDecimal("1000000.00"),
                new BigDecimal("700000.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                10,
                "2025"
        );
        when(loanApplicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(financialSnapshotRepository.findByApplication_Id(applicationId)).thenReturn(Optional.of(snapshot));
        when(scoringProvider.score(any())).thenReturn(new ScoringOutput(
                75, RiskLevel.LOW, Map.of("mock", true), "mock-v1"
        ));
        when(scoringResultRepository.save(any(ScoringResult.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ScoringResult result = scoringService.calculate(applicationId);

        verify(scoringProvider).score(any());
        verify(scoringResultRepository).save(scoringResultCaptor.capture());
        assertThat(result.getScore()).isEqualTo(75);
        assertThat(scoringResultCaptor.getValue().getRiskLevel()).isEqualTo(RiskLevel.LOW);
        verify(verificationResultRepository).findTopByApplication_IdAndTypeOrderByCheckedAtDesc(
                applicationId, VerificationType.TAX_SERVICE
        );
        verify(verificationResultRepository).findTopByApplication_IdAndTypeOrderByCheckedAtDesc(
                applicationId, VerificationType.CREDIT_BUREAU
        );
    }

    private LoanApplication application(UUID applicationId) {
        User creator = new User("creator", "creator@crednexus.local", "Creator");
        LoanApplication application = new LoanApplication(
                new Company("7701234567", "1027700132195", "CredNexus", "OOO", "ACTIVE"),
                creator,
                new CreditProduct(
                        "Business loan", new BigDecimal("10000.00"), new BigDecimal("5000000.00"),
                        6, 60, new BigDecimal("15.00"), true
                ),
                new BigDecimal("100000.00"),
                12,
                "Working capital"
        );
        ReflectionTestUtils.setField(application, "id", applicationId);
        ReflectionTestUtils.setField(application, "status", LoanApplicationStatus.SCORING);
        return application;
    }
}
