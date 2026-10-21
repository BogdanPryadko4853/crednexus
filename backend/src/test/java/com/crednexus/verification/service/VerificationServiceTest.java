package com.crednexus.verification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.Company;
import com.crednexus.product.entity.CreditProduct;
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
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
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
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class VerificationServiceTest {

    @Mock
    private LoanApplicationRepository loanApplicationRepository;

    @Mock
    private VerificationResultRepository verificationResultRepository;

    @Mock
    private WorkflowService workflowService;

    @Mock
    private WorkflowJobService workflowJobService;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Mock
    private TaxServiceMock taxServiceMock;

    @Mock
    private CreditBureauMock creditBureauMock;

    @Captor
    private ArgumentCaptor<VerificationResult> verificationResultCaptor;

    @InjectMocks
    private VerificationService verificationService;

    @Test
    void runsBothIndependentChecksForSubmittedApplication() {
        UUID applicationId = UUID.randomUUID();
        User employee = user("employee");
        LoanApplication application = application(applicationId, LoanApplicationStatus.SUBMITTED);
        when(currentUserProvider.getCurrentUser()).thenReturn(employee);
        when(loanApplicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        doAnswer(invocation -> {
            application.transitionTo(LoanApplicationStatus.VERIFYING);
            return null;
        }).when(workflowService).transition(application, LoanApplicationStatus.VERIFYING, employee);
        when(taxServiceMock.verify(application.getCompany())).thenReturn(successOutcome());
        when(creditBureauMock.verify(application.getCompany())).thenReturn(successOutcome());
        when(verificationResultRepository.countByApplication_IdAndType(applicationId, VerificationType.TAX_SERVICE))
                .thenReturn(0L);
        when(verificationResultRepository.countByApplication_IdAndType(applicationId, VerificationType.CREDIT_BUREAU))
                .thenReturn(0L);
        when(verificationResultRepository.save(any(VerificationResult.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        VerificationRunResponse response = verificationService.runVerifications(applicationId);

        verify(workflowService).transition(application, LoanApplicationStatus.VERIFYING, employee);
        verify(verificationResultRepository, org.mockito.Mockito.times(2)).save(verificationResultCaptor.capture());
        assertThat(response.applicationStatus()).isEqualTo(LoanApplicationStatus.VERIFYING);
        assertThat(response.results()).hasSize(2);
        assertThat(verificationResultCaptor.getAllValues())
                .extracting(VerificationResult::getType)
                .containsExactly(VerificationType.TAX_SERVICE, VerificationType.CREDIT_BUREAU);
        assertThat(verificationResultCaptor.getAllValues())
                .allSatisfy(result -> assertThat(result.getPayload()).containsEntry("attempt", 1L));
    }

    @Test
    void retriesOnlySourceWhoseLatestAttemptHasTechnicalError() {
        UUID applicationId = UUID.randomUUID();
        LoanApplication application = application(applicationId, LoanApplicationStatus.VERIFYING);
        VerificationResult taxError = result(application, VerificationType.TAX_SERVICE, VerificationStatus.ERROR);
        VerificationResult bureauSuccess = result(application, VerificationType.CREDIT_BUREAU, VerificationStatus.SUCCESS);

        when(currentUserProvider.getCurrentUser()).thenReturn(user("employee"));
        when(loanApplicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(verificationResultRepository.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(
                applicationId, VerificationType.TAX_SERVICE
        )).thenReturn(Optional.of(taxError));
        when(verificationResultRepository.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(
                applicationId, VerificationType.CREDIT_BUREAU
        )).thenReturn(Optional.of(bureauSuccess));
        when(verificationResultRepository.countByApplication_IdAndType(applicationId, VerificationType.TAX_SERVICE))
                .thenReturn(1L);
        when(taxServiceMock.verify(application.getCompany())).thenReturn(successOutcome());
        when(verificationResultRepository.save(any(VerificationResult.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        VerificationRunResponse response = verificationService.runVerifications(applicationId);

        assertThat(response.results()).hasSize(1);
        assertThat(response.results().getFirst().type()).isEqualTo(VerificationType.TAX_SERVICE);
        verify(creditBureauMock, never()).verify(any());
    }

    @Test
    void savesCreditBureauResultWhenTaxMockFailsTechnically() {
        UUID applicationId = UUID.randomUUID();
        User employee = user("employee");
        LoanApplication application = application(applicationId, LoanApplicationStatus.SUBMITTED);
        when(currentUserProvider.getCurrentUser()).thenReturn(employee);
        when(loanApplicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        doAnswer(invocation -> {
            application.transitionTo(LoanApplicationStatus.VERIFYING);
            return null;
        }).when(workflowService).transition(application, LoanApplicationStatus.VERIFYING, employee);
        doThrow(new IllegalStateException("timeout")).when(taxServiceMock).verify(application.getCompany());
        when(creditBureauMock.verify(application.getCompany())).thenReturn(successOutcome());
        when(verificationResultRepository.countByApplication_IdAndType(applicationId, VerificationType.TAX_SERVICE))
                .thenReturn(0L);
        when(verificationResultRepository.countByApplication_IdAndType(applicationId, VerificationType.CREDIT_BUREAU))
                .thenReturn(0L);
        when(verificationResultRepository.save(any(VerificationResult.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        VerificationRunResponse response = verificationService.runVerifications(applicationId);

        assertThat(response.results())
                .extracting(result -> result.status())
                .containsExactly(VerificationStatus.ERROR, VerificationStatus.SUCCESS);
    }

    @Test
    void rejectsRetryAfterMaximumAttemptCount() {
        UUID applicationId = UUID.randomUUID();
        LoanApplication application = application(applicationId, LoanApplicationStatus.VERIFYING);
        when(currentUserProvider.getCurrentUser()).thenReturn(user("employee"));
        when(loanApplicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(verificationResultRepository.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(
                applicationId, VerificationType.TAX_SERVICE
        )).thenReturn(Optional.of(result(application, VerificationType.TAX_SERVICE, VerificationStatus.ERROR)));
        when(verificationResultRepository.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(
                applicationId, VerificationType.CREDIT_BUREAU
        )).thenReturn(Optional.of(result(application, VerificationType.CREDIT_BUREAU, VerificationStatus.ERROR)));
        when(verificationResultRepository.countByApplication_IdAndType(applicationId, VerificationType.TAX_SERVICE))
                .thenReturn(3L);
        when(verificationResultRepository.countByApplication_IdAndType(applicationId, VerificationType.CREDIT_BUREAU))
                .thenReturn(3L);

        assertThatThrownBy(() -> verificationService.runVerifications(applicationId))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT)
                );
    }

    private MockVerificationOutcome successOutcome() {
        return new MockVerificationOutcome(VerificationStatus.SUCCESS, Map.of("outcome", "SUCCESS"));
    }

    private LoanApplication application(UUID applicationId, LoanApplicationStatus status) {
        User creator = user("creator");
        LoanApplication application = new LoanApplication(
                new Company("7701234567", "1027700132195", "CredNexus", "OOO", "ACTIVE"),
                creator,
                new CreditProduct(
                        "Business loan", new BigDecimal("10000.00"), new BigDecimal("5000000.00"), 6, 60,
                        new BigDecimal("15.00"), true
                ),
                new BigDecimal("100000.00"),
                12,
                "Working capital"
        );
        ReflectionTestUtils.setField(application, "id", applicationId);
        ReflectionTestUtils.setField(application, "status", status);
        return application;
    }

    private VerificationResult result(
            LoanApplication application,
            VerificationType type,
            VerificationStatus status
    ) {
        return new VerificationResult(application, type, status, "mock", Map.of(), Instant.now());
    }

    private User user(String keycloakId) {
        User user = new User(keycloakId, keycloakId + "@crednexus.local", keycloakId);
        ReflectionTestUtils.setField(user, "id", UUID.nameUUIDFromBytes(keycloakId.getBytes()));
        return user;
    }
}
