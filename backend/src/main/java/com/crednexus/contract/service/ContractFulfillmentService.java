package com.crednexus.contract.service;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.contract.dto.FulfillmentResponse;
import com.crednexus.contract.entity.Disbursement;
import com.crednexus.contract.entity.LoanAgreement;
import com.crednexus.contract.repository.DisbursementRepository;
import com.crednexus.contract.repository.LoanAgreementRepository;
import com.crednexus.decision.entity.CreditOffer;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.workflow.service.WorkflowJobService;
import com.crednexus.workflow.service.WorkflowService;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ContractFulfillmentService {

    private final LoanApplicationRepository applicationRepository;
    private final CreditOfferRepository offerRepository;
    private final LoanAgreementRepository agreementRepository;
    private final DisbursementRepository disbursementRepository;
    private final CompanyMemberRepository companyMemberRepository;
    private final CurrentUserProvider currentUserProvider;
    private final WorkflowService workflowService;
    private final WorkflowJobService workflowJobService;

    public ContractFulfillmentService(LoanApplicationRepository applicationRepository, CreditOfferRepository offerRepository,
                                      LoanAgreementRepository agreementRepository, DisbursementRepository disbursementRepository,
                                      CompanyMemberRepository companyMemberRepository, CurrentUserProvider currentUserProvider,
                                      WorkflowService workflowService, WorkflowJobService workflowJobService) {
        this.applicationRepository = applicationRepository;
        this.offerRepository = offerRepository;
        this.agreementRepository = agreementRepository;
        this.disbursementRepository = disbursementRepository;
        this.companyMemberRepository = companyMemberRepository;
        this.currentUserProvider = currentUserProvider;
        this.workflowService = workflowService;
        this.workflowJobService = workflowJobService;
    }

    @Transactional
    public void signAgreement(UUID applicationId) {
        LoanApplication application = application(applicationId);
        if (application.getStatus() != LoanApplicationStatus.ACCEPTED) {
            return;
        }
        CreditOffer offer = offer(applicationId);
        LoanAgreement agreement = agreementRepository.findByOffer_Decision_Application_Id(applicationId)
                .orElseGet(() -> agreementRepository.save(new LoanAgreement(offer, "CN-" + applicationId)));
        if (agreement.getSignedAt() == null) {
            agreement.sign(Instant.now());
        }
        workflowService.transition(application, LoanApplicationStatus.AGREEMENT_PENDING, null,
                "Договор сформирован и подписан в демонстрационном режиме");
        workflowJobService.enqueueDisbursement(application);
    }

    @Transactional
    public void disburse(UUID applicationId) {
        LoanApplication application = application(applicationId);
        if (application.getStatus() != LoanApplicationStatus.AGREEMENT_PENDING) {
            return;
        }
        LoanAgreement agreement = agreementRepository.findByOffer_Decision_Application_Id(applicationId)
                .orElseThrow(() -> new IllegalStateException("Signed agreement is required for disbursement"));
        Disbursement disbursement = disbursementRepository.findByAgreement_Offer_Decision_Application_Id(applicationId)
                .orElseGet(() -> disbursementRepository.save(new Disbursement(agreement, agreement.getOffer().getAmount())));
        if (disbursement.getExecutedAt() == null) {
            disbursement.complete(Instant.now());
        }
        workflowService.transition(application, LoanApplicationStatus.DISBURSED, null,
                "Выдача средств смоделирована");
    }

    @Transactional
    public void retryFulfillment(UUID applicationId) {
        LoanApplication application = application(applicationId);
        if (application.getStatus() == LoanApplicationStatus.ACCEPTED) {
            workflowJobService.enqueueAgreementSigning(application);
            return;
        }
        if (application.getStatus() == LoanApplicationStatus.AGREEMENT_PENDING) {
            workflowJobService.enqueueDisbursement(application);
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Fulfillment can only be retried for accepted applications or pending agreements");
    }

    @Transactional(readOnly = true)
    public FulfillmentResponse get(UUID applicationId) {
        LoanApplication application = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        requireAccess(application);
        LoanAgreement agreement = agreementRepository.findFirstByOffer_Decision_Application_Id(applicationId).orElse(null);
        Disbursement disbursement = disbursementRepository.findFirstByAgreement_Offer_Decision_Application_Id(applicationId).orElse(null);
        return new FulfillmentResponse(application.getStatus(), agreement == null ? null : agreement.getId(),
                agreement == null ? null : agreement.getContractNumber(), agreement == null ? null : agreement.getStatus(),
                agreement == null ? null : agreement.getSignedAt(), disbursement == null ? null : disbursement.getId(),
                disbursement == null ? null : disbursement.getAmount(), disbursement == null ? null : disbursement.getStatus(),
                disbursement == null ? null : disbursement.getExecutedAt());
    }

    private LoanApplication application(UUID applicationId) {
        return applicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new IllegalStateException("Loan application not found"));
    }

    private CreditOffer offer(UUID applicationId) {
        return offerRepository.findTopByDecision_Application_IdOrderByDecision_DecidedAtDesc(applicationId)
                .orElseThrow(() -> new IllegalStateException("Credit offer not found"));
    }

    private void requireAccess(LoanApplication application) {
        User user = currentUserProvider.getCurrentUser();
        companyMemberRepository.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId())
                .filter(member -> member.isActive())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company authority is denied"));
    }
}
