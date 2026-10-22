package com.crednexus.manualreview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.entity.InformationRequest;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.InformationRequestRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.repository.DocumentRepository;
import com.crednexus.application.repository.ApplicationStatusHistoryRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.Company;
import com.crednexus.decision.entity.CreditDecision;
import com.crednexus.decision.entity.CreditOffer;
import com.crednexus.decision.entity.DecisionType;
import com.crednexus.decision.repository.CreditDecisionRepository;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.manualreview.dto.ManualDecisionAction;
import com.crednexus.manualreview.dto.ManualDecisionRequest;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.scoring.repository.ScoringResultRepository;
import com.crednexus.verification.repository.VerificationResultRepository;
import com.crednexus.workflow.service.WorkflowJobService;
import com.crednexus.workflow.service.WorkflowService;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ManualReviewServiceTest {
    @Mock private LoanApplicationRepository applications;
    @Mock private InformationRequestRepository informationRequests;
    @Mock private CreditDecisionRepository decisions;
    @Mock private CreditOfferRepository offers;
    @Mock private CurrentUserProvider users;
    @Mock private WorkflowService workflow;
    @Mock private WorkflowJobService jobs;
    @Mock private FinancialSnapshotRepository financialSnapshots;
    @Mock private VerificationResultRepository verifications;
    @Mock private ScoringResultRepository scorings;
    @Mock private DocumentRepository documents;
    @Mock private ApplicationStatusHistoryRepository statusHistory;

    @Test
    void createsCounterOfferAndExpirationJob() {
        UUID id = UUID.randomUUID();
        LoanApplication application = application(id);
        User employee = new User("employee", "employee@test.local", "Employee");
        when(applications.findByIdForUpdate(id)).thenReturn(Optional.of(application));
        when(users.getCurrentUser()).thenReturn(employee);
        when(decisions.save(any(CreditDecision.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(offers.save(any(CreditOffer.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service().decide(id, new ManualDecisionRequest(ManualDecisionAction.COUNTER_OFFER,
                "Снижена сумма", new BigDecimal("50000"), 12, new BigDecimal("16.5")));

        assertThat(response.decisionType()).isEqualTo(DecisionType.COUNTER_OFFER);
        assertThat(response.offer().amount()).isEqualByComparingTo("50000");
        verify(workflow).transition(application, LoanApplicationStatus.OFFERED, employee, "Снижена сумма");
        verify(jobs).enqueueOfferExpiration(any(LoanApplication.class), any());
    }

    private ManualReviewService service() {
        return new ManualReviewService(applications, informationRequests, decisions, offers, users, workflow, jobs, Duration.ofDays(7),
                financialSnapshots, verifications, scorings, documents, statusHistory);
    }

    private LoanApplication application(UUID id) {
        CreditProduct product = new CreditProduct("Product", new BigDecimal("10000"), new BigDecimal("100000"), 6, 60, new BigDecimal("15"), true);
        LoanApplication application = new LoanApplication(new Company("7701234500", "1027700132195", "Company", "OOO", "ACTIVE"),
                new User("owner", "owner@test.local", "Owner"), product, new BigDecimal("70000"), 24, "Purpose");
        ReflectionTestUtils.setField(application, "id", id);
        ReflectionTestUtils.setField(application, "status", LoanApplicationStatus.MANUAL_REVIEW);
        return application;
    }
}
