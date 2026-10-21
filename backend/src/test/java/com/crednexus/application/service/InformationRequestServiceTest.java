package com.crednexus.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.application.dto.AnswerInformationRequest;
import com.crednexus.application.entity.InformationRequest;
import com.crednexus.application.entity.InformationRequestStatus;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.InformationRequestRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.Company;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.entity.CompanyMemberRole;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.workflow.service.WorkflowJobService;
import com.crednexus.workflow.service.WorkflowService;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class InformationRequestServiceTest {
    @Mock private LoanApplicationRepository applications;
    @Mock private InformationRequestRepository requests;
    @Mock private CurrentUserProvider users;
    @Mock private CompanyMemberRepository members;
    @Mock private WorkflowService workflow;
    @Mock private WorkflowJobService jobs;

    @Test
    void submitsApplicationAndEnqueuesVerificationAfterLastAnswer() {
        UUID applicationId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        User user = new User("user", "user@test.local", "User");
        ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
        Company company = new Company("7701234500", "1027700132195", "Company", "OOO", "ACTIVE");
        LoanApplication application = new LoanApplication(company, user, new CreditProduct("Product", new BigDecimal("10000"), new BigDecimal("100000"), 6, 60, new BigDecimal("15"), true), new BigDecimal("50000"), 12, "Purpose");
        ReflectionTestUtils.setField(application, "id", applicationId);
        ReflectionTestUtils.setField(application, "status", LoanApplicationStatus.NEEDS_INFO);
        InformationRequest request = new InformationRequest(application, "Уточните выручку", user);
        ReflectionTestUtils.setField(request, "id", requestId);
        when(applications.findByIdForUpdate(applicationId)).thenReturn(Optional.of(application));
        when(users.getCurrentUser()).thenReturn(user);
        when(members.findByUser_IdAndCompany_Id(user.getId(), company.getId())).thenReturn(Optional.of(new CompanyMember(user, company, "Owner", true, true, CompanyMemberRole.OWNER)));
        when(requests.findByIdAndApplication_Id(requestId, applicationId)).thenReturn(Optional.of(request));
        when(requests.existsByApplication_IdAndStatus(applicationId, InformationRequestStatus.OPEN)).thenReturn(false);

        var response = service().answer(applicationId, requestId, new AnswerInformationRequest("10 млн рублей"));

        assertThat(response.status()).isEqualTo(InformationRequestStatus.ANSWERED);
        verify(workflow).transition(application, LoanApplicationStatus.SUBMITTED, user, "Клиент ответил на все запросы уточнений");
        verify(jobs).enqueueVerification(application);
    }

    private InformationRequestService service() { return new InformationRequestService(applications, requests, users, members, workflow, jobs); }
}
