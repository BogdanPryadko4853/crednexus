package com.crednexus.workflow.service;

import com.crednexus.application.entity.ApplicationStatusHistory;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.ApplicationStatusHistoryRepository;
import com.crednexus.auth.entity.User;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkflowService {

    private static final Map<LoanApplicationStatus, Set<LoanApplicationStatus>> ALLOWED_TRANSITIONS = Map.ofEntries(
            Map.entry(LoanApplicationStatus.DRAFT, Set.of(LoanApplicationStatus.SUBMITTED)),
            Map.entry(LoanApplicationStatus.SUBMITTED, Set.of(LoanApplicationStatus.VERIFYING)),
            Map.entry(LoanApplicationStatus.VERIFYING, Set.of(
                    LoanApplicationStatus.NEEDS_INFO,
                    LoanApplicationStatus.SCORING,
                    LoanApplicationStatus.MANUAL_REVIEW
            )),
            Map.entry(LoanApplicationStatus.NEEDS_INFO, Set.of(LoanApplicationStatus.SUBMITTED)),
            Map.entry(LoanApplicationStatus.SCORING, Set.of(
                    LoanApplicationStatus.OFFERED,
                    LoanApplicationStatus.REJECTED,
                    LoanApplicationStatus.MANUAL_REVIEW
            )),
            Map.entry(LoanApplicationStatus.MANUAL_REVIEW, Set.of(
                    LoanApplicationStatus.OFFERED,
                    LoanApplicationStatus.REJECTED,
                    LoanApplicationStatus.NEEDS_INFO
            )),
            Map.entry(LoanApplicationStatus.OFFERED, Set.of(
                    LoanApplicationStatus.ACCEPTED,
                    LoanApplicationStatus.DECLINED,
                    LoanApplicationStatus.EXPIRED
            )),
            Map.entry(LoanApplicationStatus.ACCEPTED, Set.of(LoanApplicationStatus.AGREEMENT_PENDING)),
            Map.entry(LoanApplicationStatus.AGREEMENT_PENDING, Set.of(LoanApplicationStatus.DISBURSED))
    );

    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;

    public WorkflowService(ApplicationStatusHistoryRepository applicationStatusHistoryRepository) {
        this.applicationStatusHistoryRepository = applicationStatusHistoryRepository;
    }

    @Transactional
    public void transition(LoanApplication application, LoanApplicationStatus targetStatus, User actor) {
        transition(application, targetStatus, actor, null);
    }

    @Transactional
    public void transition(
            LoanApplication application,
            LoanApplicationStatus targetStatus,
            User actor,
            String reason
    ) {
        LoanApplicationStatus currentStatus = application.getStatus();
        if (!isAllowed(currentStatus, targetStatus)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Transition from " + currentStatus + " to " + targetStatus + " is not allowed"
            );
        }

        Instant occurredAt = Instant.now();
        application.transitionTo(targetStatus);
        if (targetStatus == LoanApplicationStatus.SUBMITTED) {
            application.setSubmittedAt(occurredAt);
        }
        applicationStatusHistoryRepository.save(new ApplicationStatusHistory(
                application,
                currentStatus,
                targetStatus,
                actor,
                reason,
                occurredAt
        ));
    }

    private boolean isAllowed(LoanApplicationStatus fromStatus, LoanApplicationStatus toStatus) {
        return ALLOWED_TRANSITIONS.getOrDefault(fromStatus, Set.of()).contains(toStatus);
    }
}
