package com.crednexus.application.service;

import com.crednexus.application.dto.CreateLoanApplicationRequest;
import com.crednexus.application.dto.LoanApplicationResponse;
import com.crednexus.application.dto.UpdateLoanApplicationRequest;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.entity.ApplicationStatusHistory;
import com.crednexus.application.repository.ApplicationStatusHistoryRepository;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.product.repository.CreditProductRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LoanApplicationService {

    private final LoanApplicationRepository loanApplicationRepository;
    private final FinancialSnapshotRepository financialSnapshotRepository;
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    private final CompanyMemberRepository companyMemberRepository;
    private final CreditProductRepository creditProductRepository;
    private final CurrentUserProvider currentUserProvider;

    public LoanApplicationService(
            LoanApplicationRepository loanApplicationRepository,
            FinancialSnapshotRepository financialSnapshotRepository,
            ApplicationStatusHistoryRepository applicationStatusHistoryRepository,
            CompanyMemberRepository companyMemberRepository,
            CreditProductRepository creditProductRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.loanApplicationRepository = loanApplicationRepository;
        this.financialSnapshotRepository = financialSnapshotRepository;
        this.applicationStatusHistoryRepository = applicationStatusHistoryRepository;
        this.companyMemberRepository = companyMemberRepository;
        this.creditProductRepository = creditProductRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional
    public LoanApplicationResponse createDraft(UUID companyId, CreateLoanApplicationRequest request) {
        User currentUser = currentUserProvider.getCurrentUser();
        CompanyMember membership = getActiveMembership(currentUser.getId(), companyId);
        requireCanApply(membership);

        CreditProduct product = creditProductRepository.findByIdAndActiveTrue(request.productId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Active credit product not found"));
        LoanApplication application = loanApplicationRepository.save(new LoanApplication(
                membership.getCompany(),
                currentUser,
                product,
                request.requestedAmount(),
                request.termMonths(),
                request.purpose()
        ));

        return toResponse(application);
    }

    @Transactional(readOnly = true)
    public List<LoanApplicationResponse> getCurrentUserApplications() {
        User currentUser = currentUserProvider.getCurrentUser();
        return loanApplicationRepository.findAllAccessibleByUserId(currentUser.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public LoanApplicationResponse getApplication(UUID applicationId) {
        return toResponse(getAccessibleApplication(currentUserProvider.getCurrentUser(), applicationId));
    }

    @Transactional
    public LoanApplicationResponse updateDraft(UUID applicationId, UpdateLoanApplicationRequest request) {
        User currentUser = currentUserProvider.getCurrentUser();
        LoanApplication application = getAccessibleApplication(currentUser, applicationId);
        requireDraftCreatedByCurrentUser(application, currentUser);

        DraftValues values = DraftValues.merge(application, request, creditProductRepository);
        values.applyTo(application);

        return toResponse(application);
    }

    @Transactional
    public LoanApplicationResponse submitApplication(UUID applicationId) {
        User currentUser = currentUserProvider.getCurrentUser();
        LoanApplication application = getAccessibleApplication(currentUser, applicationId);
        requireDraftCreatedByCurrentUser(application, currentUser);
        requireFinancialSnapshot(applicationId);
        CreditProduct product = getActiveProduct(application.getProduct().getId());
        validateProductLimits(application, product);

        Instant submittedAt = Instant.now();
        application.setStatus(LoanApplicationStatus.SUBMITTED);
        application.setSubmittedAt(submittedAt);
        applicationStatusHistoryRepository.save(new ApplicationStatusHistory(
                application,
                LoanApplicationStatus.DRAFT,
                LoanApplicationStatus.SUBMITTED,
                currentUser,
                submittedAt
        ));

        return toResponse(application);
    }

    private LoanApplication getAccessibleApplication(User currentUser, UUID applicationId) {
        LoanApplication application = loanApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        getActiveMembership(currentUser.getId(), application.getCompany().getId());
        return application;
    }

    private CompanyMember getActiveMembership(UUID userId, UUID companyId) {
        return companyMemberRepository.findByUser_IdAndCompany_Id(userId, companyId)
                .filter(CompanyMember::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company access is denied"));
    }

    private void requireCanApply(CompanyMember membership) {
        if (!membership.isCanApply()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Company application permission is required");
        }
    }

    private void requireFinancialSnapshot(UUID applicationId) {
        if (financialSnapshotRepository.findByApplication_Id(applicationId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Financial snapshot is required before submission");
        }
    }

    private CreditProduct getActiveProduct(UUID productId) {
        return creditProductRepository.findByIdAndActiveTrue(productId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Credit product is not active"));
    }

    private void validateProductLimits(LoanApplication application, CreditProduct product) {
        if (application.getRequestedAmount().compareTo(product.getMinAmount()) < 0
                || application.getRequestedAmount().compareTo(product.getMaxAmount()) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requested amount is outside product limits");
        }
        if (application.getTermMonths() < product.getMinTermMonths()
                || application.getTermMonths() > product.getMaxTermMonths()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requested term is outside product limits");
        }
    }

    private void requireDraftCreatedByCurrentUser(LoanApplication application, User currentUser) {
        if (application.getStatus() != LoanApplicationStatus.DRAFT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only draft applications can be updated");
        }
        if (!application.getCreatedBy().getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the application creator can update its draft");
        }
    }

    private LoanApplicationResponse toResponse(LoanApplication application) {
        return new LoanApplicationResponse(
                application.getId(),
                application.getCompany().getId(),
                application.getProduct().getId(),
                application.getCreatedBy().getId(),
                application.getRequestedAmount(),
                application.getTermMonths(),
                application.getPurpose(),
                application.getStatus(),
                application.getCreatedAt(),
                application.getUpdatedAt(),
                application.getVersion()
        );
    }

    private record DraftValues(
            CreditProduct product,
            BigDecimal requestedAmount,
            Integer termMonths,
            String purpose
    ) {

        private static DraftValues merge(
                LoanApplication application,
                UpdateLoanApplicationRequest request,
                CreditProductRepository creditProductRepository
        ) {
            CreditProduct product = request.productId() == null
                    ? application.getProduct()
                    : creditProductRepository.findByIdAndActiveTrue(request.productId())
                            .orElseThrow(() -> new ResponseStatusException(
                                    HttpStatus.NOT_FOUND, "Active credit product not found"
                            ));

            return new DraftValues(
                    product,
                    valueOrCurrent(request.requestedAmount(), application.getRequestedAmount()),
                    valueOrCurrent(request.termMonths(), application.getTermMonths()),
                    valueOrCurrent(request.purpose(), application.getPurpose())
            );
        }

        private void applyTo(LoanApplication application) {
            application.setProduct(product);
            application.setRequestedAmount(requestedAmount);
            application.setTermMonths(termMonths);
            application.setPurpose(purpose);
        }

        private static <T> T valueOrCurrent(T requestedValue, T currentValue) {
            return requestedValue != null ? requestedValue : currentValue;
        }
    }
}
