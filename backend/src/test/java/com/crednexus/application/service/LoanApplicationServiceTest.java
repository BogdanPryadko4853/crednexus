package com.crednexus.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.crednexus.application.dto.CreateLoanApplicationRequest;
import com.crednexus.application.dto.UpdateLoanApplicationRequest;
import com.crednexus.application.entity.FinancialSnapshot;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.Company;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.entity.CompanyMemberRole;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.product.repository.CreditProductRepository;
import com.crednexus.workflow.service.WorkflowService;
import com.crednexus.workflow.service.WorkflowJobService;
import java.math.BigDecimal;
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
class LoanApplicationServiceTest {

    @Mock
    private LoanApplicationRepository loanApplicationRepository;

    @Mock
    private FinancialSnapshotRepository financialSnapshotRepository;

    @Mock
    private CompanyMemberRepository companyMemberRepository;

    @Mock
    private CreditProductRepository creditProductRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Captor
    private ArgumentCaptor<LoanApplication> applicationCaptor;

    @Mock
    private WorkflowService workflowService;

    @Mock
    private WorkflowJobService workflowJobService;

    @InjectMocks
    private LoanApplicationService loanApplicationService;

    @Test
    void createsDraftForActiveMemberWithApplicationPermission() {
        UUID companyId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        User currentUser = user("creator");
        Company company = company(companyId);
        CompanyMember membership = membership(currentUser, company, true);
        CreditProduct product = product(productId, true);

        when(currentUserProvider.getCurrentUser()).thenReturn(currentUser);
        when(companyMemberRepository.findByUser_IdAndCompany_Id(currentUser.getId(), companyId))
                .thenReturn(Optional.of(membership));
        when(creditProductRepository.findByIdAndActiveTrue(productId)).thenReturn(Optional.of(product));
        when(loanApplicationRepository.save(any(LoanApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));

        loanApplicationService.createDraft(companyId, new CreateLoanApplicationRequest(
                productId, new BigDecimal("2000000.00"), 24, "Working capital"
        ));

        verify(loanApplicationRepository).save(applicationCaptor.capture());
        LoanApplication application = applicationCaptor.getValue();
        assertThat(application.getCompany()).isSameAs(company);
        assertThat(application.getCreatedBy()).isSameAs(currentUser);
        assertThat(application.getProduct()).isSameAs(product);
        assertThat(application.getStatus()).isEqualTo(LoanApplicationStatus.DRAFT);
    }

    @Test
    void rejectsDraftCreationWithoutApplicationPermission() {
        UUID companyId = UUID.randomUUID();
        User currentUser = user("representative");
        CompanyMember membership = membership(currentUser, company(companyId), false);

        when(currentUserProvider.getCurrentUser()).thenReturn(currentUser);
        when(companyMemberRepository.findByUser_IdAndCompany_Id(currentUser.getId(), companyId))
                .thenReturn(Optional.of(membership));

        assertThatThrownBy(() -> loanApplicationService.createDraft(companyId, new CreateLoanApplicationRequest(
                UUID.randomUUID(), new BigDecimal("100000.00"), 12, "Working capital"
        )))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN)
                );
        verifyNoInteractions(creditProductRepository, loanApplicationRepository);
    }

    @Test
    void updatesOwnDraftWithAnotherActiveProduct() {
        UUID companyId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        UUID newProductId = UUID.randomUUID();
        User currentUser = user("creator");
        Company company = company(companyId);
        LoanApplication application = new LoanApplication(
                company,
                currentUser,
                product(UUID.randomUUID(), true),
                new BigDecimal("100000.00"),
                12,
                "Working capital"
        );
        CreditProduct newProduct = product(newProductId, true);

        when(currentUserProvider.getCurrentUser()).thenReturn(currentUser);
        when(loanApplicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(companyMemberRepository.findByUser_IdAndCompany_Id(currentUser.getId(), companyId))
                .thenReturn(Optional.of(membership(currentUser, company, true)));
        when(creditProductRepository.findByIdAndActiveTrue(newProductId)).thenReturn(Optional.of(newProduct));

        loanApplicationService.updateDraft(applicationId, new UpdateLoanApplicationRequest(
                newProductId, new BigDecimal("150000.00"), null, null
        ));

        assertThat(application.getProduct()).isSameAs(newProduct);
        assertThat(application.getRequestedAmount()).isEqualByComparingTo("150000.00");
        assertThat(application.getTermMonths()).isEqualTo(12);
    }

    @Test
    void rejectsUpdateOfDraftCreatedByAnotherUser() {
        UUID companyId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        User currentUser = user("current-user");
        User creator = user("creator");
        Company company = company(companyId);
        LoanApplication application = new LoanApplication(
                company, creator, product(UUID.randomUUID(), true), new BigDecimal("100000.00"), 12, "Working capital"
        );

        when(currentUserProvider.getCurrentUser()).thenReturn(currentUser);
        when(loanApplicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(companyMemberRepository.findByUser_IdAndCompany_Id(currentUser.getId(), companyId))
                .thenReturn(Optional.of(membership(currentUser, company, true)));

        assertThatThrownBy(() -> loanApplicationService.updateDraft(
                applicationId, new UpdateLoanApplicationRequest(null, null, null, "New purpose")
        ))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN)
                );
    }

    @Test
    void submitsDraftAndRecordsStatusHistory() {
        UUID companyId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        User creator = user("creator");
        Company company = company(companyId);
        CreditProduct product = product(productId, true);
        LoanApplication application = new LoanApplication(
                company, creator, product, new BigDecimal("100000.00"), 12, "Working capital"
        );
        ReflectionTestUtils.setField(application, "id", applicationId);
        FinancialSnapshot snapshot = new FinancialSnapshot(
                application,
                new BigDecimal("1000000.00"),
                new BigDecimal("700000.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                10,
                "2025"
        );

        when(currentUserProvider.getCurrentUser()).thenReturn(creator);
        when(loanApplicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(companyMemberRepository.findByUser_IdAndCompany_Id(creator.getId(), companyId))
                .thenReturn(Optional.of(membership(creator, company, true)));
        when(financialSnapshotRepository.findByApplication_Id(applicationId)).thenReturn(Optional.of(snapshot));
        when(creditProductRepository.findByIdAndActiveTrue(productId)).thenReturn(Optional.of(product));

        loanApplicationService.submitApplication(applicationId);

        verify(workflowService).transition(application, LoanApplicationStatus.SUBMITTED, creator);
    }

    @Test
    void rejectsSubmissionWithoutFinancialSnapshot() {
        UUID companyId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        User creator = user("creator");
        Company company = company(companyId);
        LoanApplication application = new LoanApplication(
                company, creator, product(UUID.randomUUID(), true), new BigDecimal("100000.00"), 12, "Working capital"
        );
        ReflectionTestUtils.setField(application, "id", applicationId);

        when(currentUserProvider.getCurrentUser()).thenReturn(creator);
        when(loanApplicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(companyMemberRepository.findByUser_IdAndCompany_Id(creator.getId(), companyId))
                .thenReturn(Optional.of(membership(creator, company, true)));
        when(financialSnapshotRepository.findByApplication_Id(applicationId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> loanApplicationService.submitApplication(applicationId))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT)
                );
    }

    private User user(String keycloakId) {
        User user = new User(keycloakId, keycloakId + "@crednexus.local", keycloakId);
        ReflectionTestUtils.setField(user, "id", UUID.nameUUIDFromBytes(keycloakId.getBytes()));
        return user;
    }

    private Company company(UUID companyId) {
        Company company = new Company("7701234567", "1027700132195", "CredNexus", "OOO", "ACTIVE");
        ReflectionTestUtils.setField(company, "id", companyId);
        return company;
    }

    private CompanyMember membership(User user, Company company, boolean canApply) {
        return new CompanyMember(user, company, "Director", canApply, true, CompanyMemberRole.OWNER);
    }

    private CreditProduct product(UUID productId, boolean active) {
        CreditProduct product = new CreditProduct(
                "Business loan", new BigDecimal("10000.00"), new BigDecimal("5000000.00"), 6, 60,
                new BigDecimal("15.00"), active
        );
        ReflectionTestUtils.setField(product, "id", productId);
        return product;
    }
}
