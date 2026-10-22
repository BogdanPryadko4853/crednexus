package com.crednexus.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.crednexus.application.entity.ApplicationStatusHistory;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.ApplicationStatusHistoryRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.company.entity.Company;
import com.crednexus.product.entity.CreditProduct;
import java.math.BigDecimal;
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
class WorkflowServiceTest {

    @Mock
    private ApplicationStatusHistoryRepository applicationStatusHistoryRepository;

    @Captor
    private ArgumentCaptor<ApplicationStatusHistory> statusHistoryCaptor;

    @InjectMocks
    private WorkflowService workflowService;

    @Test
    void transitionsDraftToSubmittedAndRecordsHistory() {
        User actor = user("creator");
        LoanApplication application = draft(actor);

        workflowService.transition(application, LoanApplicationStatus.SUBMITTED, actor);

        assertThat(application.getStatus()).isEqualTo(LoanApplicationStatus.SUBMITTED);
        assertThat(application.getSubmittedAt()).isNotNull();
        verify(applicationStatusHistoryRepository).save(statusHistoryCaptor.capture());
        ApplicationStatusHistory history = statusHistoryCaptor.getValue();
        assertThat(history.getApplication()).isSameAs(application);
        assertThat(history.getFromStatus()).isEqualTo(LoanApplicationStatus.DRAFT);
        assertThat(history.getToStatus()).isEqualTo(LoanApplicationStatus.SUBMITTED);
        assertThat(history.getActor()).isSameAs(actor);
        assertThat(history.getOccurredAt()).isNotNull();
    }

    @Test
    void rejectsTransitionOutsideStateMachine() {
        LoanApplication application = draft(user("creator"));

        assertThatThrownBy(() -> workflowService.transition(
                application, LoanApplicationStatus.SCORING, user("creator")
        ))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT)
                );
        assertThat(application.getStatus()).isEqualTo(LoanApplicationStatus.DRAFT);
        verifyNoInteractions(applicationStatusHistoryRepository);
    }

    private LoanApplication draft(User creator) {
        return new LoanApplication(
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
    }

    private User user(String keycloakId) {
        User user = new User(keycloakId, keycloakId + "@crednexus.local", keycloakId);
        ReflectionTestUtils.setField(user, "id", UUID.nameUUIDFromBytes(keycloakId.getBytes()));
        return user;
    }
}
