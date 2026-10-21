package com.crednexus.decision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.Company;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.entity.CompanyMemberRole;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.decision.entity.CreditDecision;
import com.crednexus.decision.entity.CreditOffer;
import com.crednexus.decision.entity.CreditOfferStatus;
import com.crednexus.decision.entity.DecisionType;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.workflow.service.WorkflowService;
import com.crednexus.workflow.service.WorkflowJobService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class OfferServiceTest {

    @Mock private LoanApplicationRepository applicationRepository;
    @Mock private CreditOfferRepository offerRepository;
    @Mock private CurrentUserProvider currentUserProvider;
    @Mock private CompanyMemberRepository companyMemberRepository;
    @Mock private WorkflowService workflowService;
    @Mock private WorkflowJobService workflowJobService;

    @Test
    void acceptsOfferAndRepeatsSafely() {
        UUID applicationId = UUID.randomUUID();
        User user = user();
        LoanApplication application = application(applicationId, user);
        CreditOffer offer = offer(application, Instant.now().plusSeconds(60));
        stubAccess(applicationId, application, offer, user, true);
        OfferService service = service();

        assertThat(service.accept(applicationId).offer().status()).isEqualTo(CreditOfferStatus.ACCEPTED);
        assertThat(service.accept(applicationId).offer().status()).isEqualTo(CreditOfferStatus.ACCEPTED);

        verify(workflowService).transition(application, LoanApplicationStatus.ACCEPTED, user);
    }

    @Test
    void expiresOfferAtBoundaryBeforeAccepting() {
        UUID applicationId = UUID.randomUUID();
        User user = user();
        LoanApplication application = application(applicationId, user);
        CreditOffer offer = offer(application, Instant.now());
        stubAccess(applicationId, application, offer, user, true);

        assertThatThrownBy(() -> service().accept(applicationId))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        assertThat(offer.getStatus()).isEqualTo(CreditOfferStatus.EXPIRED);
        verify(workflowService).transition(application, LoanApplicationStatus.EXPIRED, null,
                "Срок действия кредитного предложения истёк");
    }

    @Test
    void rejectsMemberWithoutApplicationAuthority() {
        UUID applicationId = UUID.randomUUID();
        User user = user();
        LoanApplication application = application(applicationId, user);
        when(applicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(currentUserProvider.getCurrentUser()).thenReturn(user);
        when(companyMemberRepository.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId()))
                .thenReturn(Optional.of(new CompanyMember(user, application.getCompany(), "Director", false, true,
                        CompanyMemberRole.OWNER)));

        assertThatThrownBy(() -> service().decline(applicationId))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    private OfferService service() {
        return new OfferService(applicationRepository, offerRepository, currentUserProvider, companyMemberRepository,
                workflowService, workflowJobService);
    }

    private void stubAccess(UUID applicationId, LoanApplication application, CreditOffer offer, User user, boolean canApply) {
        when(applicationRepository.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(offerRepository.findTopByDecision_Application_IdOrderByDecision_DecidedAtDesc(applicationId)).thenReturn(Optional.of(offer));
        when(currentUserProvider.getCurrentUser()).thenReturn(user);
        when(companyMemberRepository.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId()))
                .thenReturn(Optional.of(new CompanyMember(user, application.getCompany(), "Director", canApply, true, CompanyMemberRole.OWNER)));
    }

    private User user() {
        User user = new User("user", "user@test.local", "User");
        ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
        return user;
    }

    private LoanApplication application(UUID id, User user) {
        LoanApplication application = new LoanApplication(new Company("7701234500", "1027700132195", "Test", "OOO", "ACTIVE"), user,
                new CreditProduct("Product", new BigDecimal("10000"), new BigDecimal("5000000"), 6, 60, new BigDecimal("15"), true),
                new BigDecimal("100000"), 12, "Purpose");
        ReflectionTestUtils.setField(application, "id", id);
        ReflectionTestUtils.setField(application, "status", LoanApplicationStatus.OFFERED);
        return application;
    }

    private CreditOffer offer(LoanApplication application, Instant expiresAt) {
        CreditDecision decision = new CreditDecision(application, DecisionType.APPROVED, "Approved", null, Instant.now(), "test");
        ReflectionTestUtils.setField(decision, "id", UUID.randomUUID());
        return new CreditOffer(decision, new BigDecimal("100000"), 12, new BigDecimal("15"), CreditOfferStatus.OFFERED, expiresAt);
    }
}
