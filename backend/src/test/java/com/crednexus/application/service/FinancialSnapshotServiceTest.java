package com.crednexus.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.dto.UpsertFinancialSnapshotRequest;
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
class FinancialSnapshotServiceTest {

    @Mock
    private FinancialSnapshotRepository financialSnapshotRepository;

    @Mock
    private LoanApplicationRepository loanApplicationRepository;

    @Mock
    private CompanyMemberRepository companyMemberRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Captor
    private ArgumentCaptor<FinancialSnapshot> financialSnapshotCaptor;

    @InjectMocks
    private FinancialSnapshotService financialSnapshotService;

    @Test
    void createsFinancialSnapshotForOwnDraft() {
        UUID applicationId = UUID.randomUUID();
        User creator = user("creator");
        Company company = company(UUID.randomUUID());
        LoanApplication application = application(applicationId, company, creator, LoanApplicationStatus.DRAFT);

        when(currentUserProvider.getCurrentUser()).thenReturn(creator);
        when(loanApplicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(companyMemberRepository.findByUser_IdAndCompany_Id(creator.getId(), company.getId()))
                .thenReturn(Optional.of(membership(creator, company)));
        when(financialSnapshotRepository.findByApplication_Id(applicationId)).thenReturn(Optional.empty());
        when(financialSnapshotRepository.save(any(FinancialSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        financialSnapshotService.upsertFinancialSnapshot(applicationId, request());

        verify(financialSnapshotRepository).save(financialSnapshotCaptor.capture());
        FinancialSnapshot snapshot = financialSnapshotCaptor.getValue();
        assertThat(snapshot.getApplication()).isSameAs(application);
        assertThat(snapshot.getAnnualRevenue()).isEqualByComparingTo("1000000.00");
        assertThat(snapshot.getEmployeeCount()).isEqualTo(10);
    }

    @Test
    void replacesExistingFinancialSnapshot() {
        UUID applicationId = UUID.randomUUID();
        User creator = user("creator");
        Company company = company(UUID.randomUUID());
        LoanApplication application = application(applicationId, company, creator, LoanApplicationStatus.DRAFT);
        FinancialSnapshot snapshot = new FinancialSnapshot(
                application,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                1,
                "2024"
        );
        ReflectionTestUtils.setField(snapshot, "id", UUID.randomUUID());

        when(currentUserProvider.getCurrentUser()).thenReturn(creator);
        when(loanApplicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(companyMemberRepository.findByUser_IdAndCompany_Id(creator.getId(), company.getId()))
                .thenReturn(Optional.of(membership(creator, company)));
        when(financialSnapshotRepository.findByApplication_Id(applicationId)).thenReturn(Optional.of(snapshot));

        financialSnapshotService.upsertFinancialSnapshot(applicationId, request());

        assertThat(snapshot.getAnnualRevenue()).isEqualByComparingTo("1000000.00");
        assertThat(snapshot.getPeriod()).isEqualTo("2025");
    }

    @Test
    void rejectsFinancialSnapshotChangeForSubmittedApplication() {
        UUID applicationId = UUID.randomUUID();
        User creator = user("creator");
        Company company = company(UUID.randomUUID());
        LoanApplication application = application(applicationId, company, creator, LoanApplicationStatus.SUBMITTED);

        when(currentUserProvider.getCurrentUser()).thenReturn(creator);
        when(loanApplicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(companyMemberRepository.findByUser_IdAndCompany_Id(creator.getId(), company.getId()))
                .thenReturn(Optional.of(membership(creator, company)));

        assertThatThrownBy(() -> financialSnapshotService.upsertFinancialSnapshot(applicationId, request()))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT)
                );
    }

    private UpsertFinancialSnapshotRequest request() {
        return new UpsertFinancialSnapshotRequest(
                new BigDecimal("1000000.00"),
                new BigDecimal("700000.00"),
                new BigDecimal("150000.00"),
                new BigDecimal("15000.00"),
                10,
                "2025"
        );
    }

    private LoanApplication application(UUID applicationId, Company company, User user, LoanApplicationStatus status) {
        LoanApplication application = new LoanApplication(
                company,
                user,
                new CreditProduct(
                        "Business loan", new BigDecimal("10000.00"), new BigDecimal("5000000.00"), 6, 60,
                        new BigDecimal("15.00"), true
                ),
                new BigDecimal("100000.00"),
                12,
                "Working capital"
        );
        ReflectionTestUtils.setField(application, "status", status);
        ReflectionTestUtils.setField(application, "id", applicationId);
        return application;
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

    private CompanyMember membership(User user, Company company) {
        return new CompanyMember(user, company, "Director", true, true, CompanyMemberRole.OWNER);
    }
}
