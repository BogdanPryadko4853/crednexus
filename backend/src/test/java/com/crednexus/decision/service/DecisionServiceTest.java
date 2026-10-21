package com.crednexus.decision.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.Company;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.decision.entity.CreditDecision;
import com.crednexus.decision.entity.CreditOffer;
import com.crednexus.decision.entity.DecisionType;
import com.crednexus.decision.policy.DecisionAction;
import com.crednexus.decision.policy.DecisionOutput;
import com.crednexus.decision.policy.DecisionPolicy;
import com.crednexus.decision.repository.CreditDecisionRepository;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.scoring.entity.RiskLevel;
import com.crednexus.scoring.entity.ScoringResult;
import com.crednexus.scoring.repository.ScoringResultRepository;
import com.crednexus.workflow.service.WorkflowService;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
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
class DecisionServiceTest {

    @Mock
    private LoanApplicationRepository loanApplicationRepository;

    @Mock
    private ScoringResultRepository scoringResultRepository;

    @Mock
    private CreditDecisionRepository creditDecisionRepository;

    @Mock
    private CreditOfferRepository creditOfferRepository;

    @Mock
    private DecisionPolicy decisionPolicy;

    @Mock
    private WorkflowService workflowService;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Mock
    private CompanyMemberRepository companyMemberRepository;

    @Captor
    private ArgumentCaptor<CreditDecision> decisionCaptor;

    @Captor
    private ArgumentCaptor<CreditOffer> offerCaptor;

    private DecisionService decisionService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        decisionService = new DecisionService(
                loanApplicationRepository,
                scoringResultRepository,
                creditDecisionRepository,
                creditOfferRepository,
                decisionPolicy,
                workflowService,
                currentUserProvider,
                companyMemberRepository,
                Duration.ofDays(7)
        );
    }

    @Test
    void createsDecisionAndOfferForApproval() {
        UUID applicationId = UUID.randomUUID();
        LoanApplication application = application(applicationId);
        ScoringResult scoring = scoring(application, RiskLevel.LOW);
        when(loanApplicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(scoringResultRepository.findTopByApplication_IdOrderByCalculatedAtDesc(applicationId)).thenReturn(Optional.of(scoring));
        when(decisionPolicy.evaluate(any())).thenReturn(new DecisionOutput(
                DecisionAction.OFFER,
                DecisionType.APPROVED,
                "Одобрено",
                new DecisionOutput.OfferTerms(new BigDecimal("2000000.00"), 24, new BigDecimal("15.00")),
                "mock-policy-v1"
        ));
        when(creditDecisionRepository.save(any(CreditDecision.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        decisionService.decide(applicationId);

        verify(creditDecisionRepository).save(decisionCaptor.capture());
        verify(creditOfferRepository).save(offerCaptor.capture());
        verify(workflowService).transition(application, LoanApplicationStatus.OFFERED, null);
        org.assertj.core.api.Assertions.assertThat(decisionCaptor.getValue().getDecisionType())
                .isEqualTo(DecisionType.APPROVED);
        org.assertj.core.api.Assertions.assertThat(offerCaptor.getValue().getAmount())
                .isEqualByComparingTo("2000000.00");
    }

    @Test
    void routesMediumRiskToManualReviewWithoutFinalDecision() {
        UUID applicationId = UUID.randomUUID();
        LoanApplication application = application(applicationId);
        when(loanApplicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(scoringResultRepository.findTopByApplication_IdOrderByCalculatedAtDesc(applicationId))
                .thenReturn(Optional.of(scoring(application, RiskLevel.MEDIUM)));
        when(decisionPolicy.evaluate(any())).thenReturn(new DecisionOutput(
                DecisionAction.MANUAL_REVIEW, null, "Ручное рассмотрение", null, "mock-policy-v1"
        ));

        decisionService.decide(applicationId);

        verify(workflowService).transition(application, LoanApplicationStatus.MANUAL_REVIEW, null);
        verify(creditDecisionRepository, never()).save(any());
        verify(creditOfferRepository, never()).save(any());
    }

    private LoanApplication application(UUID applicationId) {
        LoanApplication application = new LoanApplication(
                new Company("7701234567", "1027700132195", "CredNexus", "OOO", "ACTIVE"),
                new com.crednexus.auth.entity.User("creator", "creator@crednexus.local", "Creator"),
                new CreditProduct(
                        "Business loan", new BigDecimal("10000.00"), new BigDecimal("5000000.00"),
                        6, 60, new BigDecimal("15.00"), true
                ),
                new BigDecimal("2000000.00"), 24, "Working capital"
        );
        ReflectionTestUtils.setField(application, "id", applicationId);
        ReflectionTestUtils.setField(application, "status", LoanApplicationStatus.SCORING);
        return application;
    }

    private ScoringResult scoring(LoanApplication application, RiskLevel riskLevel) {
        return new ScoringResult(application, 75, riskLevel, Map.of("mock", true), "mock-v1", Instant.now());
    }
}
