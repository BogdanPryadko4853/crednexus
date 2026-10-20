package com.crednexus.application.service;

import com.crednexus.application.dto.FinancialSnapshotResponse;
import com.crednexus.application.dto.UpsertFinancialSnapshotRequest;
import com.crednexus.application.entity.FinancialSnapshot;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.repository.CompanyMemberRepository;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FinancialSnapshotService {

    private final FinancialSnapshotRepository financialSnapshotRepository;
    private final LoanApplicationRepository loanApplicationRepository;
    private final CompanyMemberRepository companyMemberRepository;
    private final CurrentUserProvider currentUserProvider;

    public FinancialSnapshotService(
            FinancialSnapshotRepository financialSnapshotRepository,
            LoanApplicationRepository loanApplicationRepository,
            CompanyMemberRepository companyMemberRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.financialSnapshotRepository = financialSnapshotRepository;
        this.loanApplicationRepository = loanApplicationRepository;
        this.companyMemberRepository = companyMemberRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional
    public FinancialSnapshotResponse upsertFinancialSnapshot(
            UUID applicationId,
            UpsertFinancialSnapshotRequest request
    ) {
        User currentUser = currentUserProvider.getCurrentUser();
        LoanApplication application = getAccessibleApplication(currentUser, applicationId);
        requireDraftCreatedByCurrentUser(application, currentUser);

        FinancialSnapshot snapshot = financialSnapshotRepository.findByApplication_Id(applicationId)
                .orElseGet(() -> new FinancialSnapshot(
                        application,
                        request.annualRevenue(),
                        request.annualExpenses(),
                        request.existingDebt(),
                        request.monthlyPayments(),
                        request.employeeCount(),
                        request.period()
                ));
        updateSnapshot(snapshot, request);

        if (snapshot.getId() == null) {
            snapshot = financialSnapshotRepository.save(snapshot);
        }

        return toResponse(snapshot);
    }

    @Transactional(readOnly = true)
    public FinancialSnapshotResponse getFinancialSnapshot(UUID applicationId) {
        LoanApplication application = getAccessibleApplication(currentUserProvider.getCurrentUser(), applicationId);
        return financialSnapshotRepository.findByApplication_Id(application.getId())
                .map(this::toResponse)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Financial snapshot not found"));
    }

    private LoanApplication getAccessibleApplication(User currentUser, UUID applicationId) {
        LoanApplication application = loanApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        companyMemberRepository.findByUser_IdAndCompany_Id(currentUser.getId(), application.getCompany().getId())
                .filter(CompanyMember::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company access is denied"));
        return application;
    }

    private void requireDraftCreatedByCurrentUser(LoanApplication application, User currentUser) {
        if (application.getStatus() != LoanApplicationStatus.DRAFT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only draft applications can be updated");
        }
        if (!application.getCreatedBy().getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the application creator can update its draft");
        }
    }

    private void updateSnapshot(FinancialSnapshot snapshot, UpsertFinancialSnapshotRequest request) {
        snapshot.setAnnualRevenue(request.annualRevenue());
        snapshot.setAnnualExpenses(request.annualExpenses());
        snapshot.setExistingDebt(request.existingDebt());
        snapshot.setMonthlyPayments(request.monthlyPayments());
        snapshot.setEmployeeCount(request.employeeCount());
        snapshot.setPeriod(request.period());
    }

    private FinancialSnapshotResponse toResponse(FinancialSnapshot snapshot) {
        return new FinancialSnapshotResponse(
                snapshot.getId(),
                snapshot.getApplication().getId(),
                snapshot.getAnnualRevenue(),
                snapshot.getAnnualExpenses(),
                snapshot.getExistingDebt(),
                snapshot.getMonthlyPayments(),
                snapshot.getEmployeeCount(),
                snapshot.getPeriod()
        );
    }
}
