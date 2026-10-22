package com.crednexus.application.service;

import com.crednexus.application.dto.ApplicationStatusHistoryResponse;
import com.crednexus.application.entity.ApplicationStatusHistory;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.repository.ApplicationStatusHistoryRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.repository.CompanyMemberRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ApplicationHistoryService {
    private final LoanApplicationRepository applications;
    private final ApplicationStatusHistoryRepository history;
    private final CurrentUserProvider users;
    private final CompanyMemberRepository members;

    public ApplicationHistoryService(LoanApplicationRepository applications, ApplicationStatusHistoryRepository history,
                                     CurrentUserProvider users, CompanyMemberRepository members) {
        this.applications = applications;
        this.history = history;
        this.users = users;
        this.members = members;
    }

    @Transactional(readOnly = true)
    public List<ApplicationStatusHistoryResponse> getHistory(UUID applicationId) {
        LoanApplication application = applications.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        User user = users.getCurrentUser();
        members.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId()).filter(member -> member.isActive())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company access is denied"));
        return history.findAllByApplication_IdOrderByOccurredAtAsc(applicationId).stream().map(this::response).toList();
    }

    private ApplicationStatusHistoryResponse response(ApplicationStatusHistory item) {
        return new ApplicationStatusHistoryResponse(item.getId(), item.getFromStatus(), item.getToStatus(), item.getOccurredAt(),
                sanitizeReason(item.getReason()), item.getActor() == null ? null : item.getActor().getId(),
                item.getActor() == null ? null : item.getActor().getFullName());
    }

    private String sanitizeReason(String reason) {
        if (reason == null) return null;
        return reason.contains("Техническая") || reason.contains("Exception")
                ? "Техническая обработка требует внимания сотрудника банка" : reason;
    }
}
