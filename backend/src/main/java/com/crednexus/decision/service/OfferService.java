package com.crednexus.decision.service;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.decision.dto.CreditOfferResponse;
import com.crednexus.decision.dto.OfferActionResponse;
import com.crednexus.decision.entity.CreditOffer;
import com.crednexus.decision.entity.CreditOfferStatus;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.workflow.service.WorkflowService;
import com.crednexus.workflow.service.WorkflowJobService;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OfferService {

    private final LoanApplicationRepository loanApplicationRepository;
    private final CreditOfferRepository creditOfferRepository;
    private final CurrentUserProvider currentUserProvider;
    private final CompanyMemberRepository companyMemberRepository;
    private final WorkflowService workflowService;
    private final WorkflowJobService workflowJobService;

    public OfferService(LoanApplicationRepository loanApplicationRepository, CreditOfferRepository creditOfferRepository,
                        CurrentUserProvider currentUserProvider, CompanyMemberRepository companyMemberRepository,
                        WorkflowService workflowService, WorkflowJobService workflowJobService) {
        this.loanApplicationRepository = loanApplicationRepository;
        this.creditOfferRepository = creditOfferRepository;
        this.currentUserProvider = currentUserProvider;
        this.companyMemberRepository = companyMemberRepository;
        this.workflowService = workflowService;
        this.workflowJobService = workflowJobService;
    }

    @Transactional(noRollbackFor = OfferExpiredException.class)
    public OfferActionResponse accept(UUID applicationId) {
        return act(applicationId, CreditOfferStatus.ACCEPTED);
    }

    @Transactional(noRollbackFor = OfferExpiredException.class)
    public OfferActionResponse decline(UUID applicationId) {
        return act(applicationId, CreditOfferStatus.DECLINED);
    }

    @Transactional
    public boolean expireIfDue(UUID applicationId) {
        LoanApplication application = loadApplicationForUpdate(applicationId);
        CreditOffer offer = loadCurrentOfferForUpdate(applicationId);
        if (application.getStatus() != LoanApplicationStatus.OFFERED
                || offer.getStatus() != CreditOfferStatus.OFFERED
                || Instant.now().isBefore(offer.getExpiresAt())) {
            return false;
        }
        offer.expire();
        workflowService.transition(application, LoanApplicationStatus.EXPIRED, null, "Срок действия кредитного предложения истёк");
        return true;
    }

    private OfferActionResponse act(UUID applicationId, CreditOfferStatus targetStatus) {
        LoanApplication application = loadApplicationForUpdate(applicationId);
        requireAuthority(application);
        CreditOffer offer = loadCurrentOfferForUpdate(applicationId);
        if (offer.getStatus() == targetStatus) {
            return response(application, offer);
        }
        if (application.getStatus() != LoanApplicationStatus.OFFERED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Loan application has no active offer");
        }
        if (offer.getStatus() != CreditOfferStatus.OFFERED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Credit offer is no longer active");
        }
        if (!Instant.now().isBefore(offer.getExpiresAt())) {
            offer.expire();
            workflowService.transition(application, LoanApplicationStatus.EXPIRED, null,
                    "Срок действия кредитного предложения истёк");
            throw new OfferExpiredException();
        }
        if (targetStatus == CreditOfferStatus.ACCEPTED) {
            offer.accept();
            workflowService.transition(application, LoanApplicationStatus.ACCEPTED, currentUserProvider.getCurrentUser());
            workflowJobService.enqueueAgreementSigning(application);
        } else {
            offer.decline();
            workflowService.transition(application, LoanApplicationStatus.DECLINED, currentUserProvider.getCurrentUser());
        }
        return response(application, offer);
    }

    private LoanApplication loadApplicationForUpdate(UUID applicationId) {
        return loanApplicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
    }

    private CreditOffer loadCurrentOfferForUpdate(UUID applicationId) {
        return creditOfferRepository.findTopByDecision_Application_IdOrderByDecision_DecidedAtDesc(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Credit offer not found"));
    }

    private void requireAuthority(LoanApplication application) {
        User user = currentUserProvider.getCurrentUser();
        companyMemberRepository.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId())
                .filter(member -> member.isActive() && member.isCanApply())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company authority is denied"));
    }

    private OfferActionResponse response(LoanApplication application, CreditOffer offer) {
        return new OfferActionResponse(application.getStatus(), new CreditOfferResponse(
                offer.getId(), offer.getAmount(), offer.getTermMonths(), offer.getInterestRate(),
                offer.getStatus(), offer.getExpiresAt()));
    }
}
