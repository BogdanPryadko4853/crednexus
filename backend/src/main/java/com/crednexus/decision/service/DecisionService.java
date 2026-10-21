package com.crednexus.decision.service;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.decision.dto.CreditDecisionResponse;
import com.crednexus.decision.dto.CreditOfferResponse;
import com.crednexus.decision.entity.CreditDecision;
import com.crednexus.decision.entity.CreditOffer;
import com.crednexus.decision.entity.CreditOfferStatus;
import com.crednexus.decision.policy.DecisionAction;
import com.crednexus.decision.policy.DecisionInput;
import com.crednexus.decision.policy.DecisionOutput;
import com.crednexus.decision.policy.DecisionPolicy;
import com.crednexus.decision.repository.CreditDecisionRepository;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.scoring.entity.ScoringResult;
import com.crednexus.scoring.repository.ScoringResultRepository;
import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.repository.VerificationResultRepository;
import com.crednexus.workflow.service.WorkflowService;
import com.crednexus.workflow.service.WorkflowJobService;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DecisionService {

    private final LoanApplicationRepository loanApplicationRepository;
    private final ScoringResultRepository scoringResultRepository;
    private final VerificationResultRepository verificationResultRepository;
    private final CreditDecisionRepository creditDecisionRepository;
    private final CreditOfferRepository creditOfferRepository;
    private final DecisionPolicy decisionPolicy;
    private final WorkflowService workflowService;
    private final CurrentUserProvider currentUserProvider;
    private final CompanyMemberRepository companyMemberRepository;
    private final Duration offerValidity;
    private final WorkflowJobService workflowJobService;

    public DecisionService(
            LoanApplicationRepository loanApplicationRepository,
            ScoringResultRepository scoringResultRepository,
            VerificationResultRepository verificationResultRepository,
            CreditDecisionRepository creditDecisionRepository,
            CreditOfferRepository creditOfferRepository,
            DecisionPolicy decisionPolicy,
            WorkflowService workflowService,
            CurrentUserProvider currentUserProvider,
            CompanyMemberRepository companyMemberRepository,
            WorkflowJobService workflowJobService,
            @Value("${decision.offer-validity:P7D}") Duration offerValidity
    ) {
        this.loanApplicationRepository = loanApplicationRepository;
        this.scoringResultRepository = scoringResultRepository;
        this.verificationResultRepository = verificationResultRepository;
        this.creditDecisionRepository = creditDecisionRepository;
        this.creditOfferRepository = creditOfferRepository;
        this.decisionPolicy = decisionPolicy;
        this.workflowService = workflowService;
        this.currentUserProvider = currentUserProvider;
        this.companyMemberRepository = companyMemberRepository;
        this.workflowJobService = workflowJobService;
        this.offerValidity = offerValidity;
    }

    @Transactional
    public void decide(UUID applicationId) {
        LoanApplication application = loanApplicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        if (application.getStatus() != LoanApplicationStatus.SCORING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Decision cannot run for this application status");
        }
        ScoringResult scoringResult = scoringResultRepository.findTopByApplication_IdOrderByCalculatedAtDesc(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Scoring result is required"));
        if (hasFailedBusinessVerification(applicationId)) {
            workflowService.transition(application, LoanApplicationStatus.MANUAL_REVIEW, null,
                    "Отрицательный бизнес-результат проверки не допускает автоматического решения");
            return;
        }
        DecisionOutput output = decisionPolicy.evaluate(new DecisionInput(
                application.getId(),
                application.getRequestedAmount(),
                application.getTermMonths(),
                application.getProduct().getBaseRate(),
                scoringResult.getScore(),
                scoringResult.getRiskLevel()
        ));
        applyDecision(application, output);
    }

    private boolean hasFailedBusinessVerification(UUID applicationId) {
        for (VerificationType type : VerificationType.values()) {
            if (verificationResultRepository.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(applicationId, type)
                    .map(result -> result.getStatus() == VerificationStatus.FAILED)
                    .orElse(false)) {
                return true;
            }
        }
        return false;
    }

    @Transactional(readOnly = true)
    public CreditDecisionResponse getLatestDecision(UUID applicationId) {
        LoanApplication application = loanApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        User user = currentUserProvider.getCurrentUser();
        companyMemberRepository.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId())
                .filter(CompanyMember::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company access is denied"));
        CreditDecision decision = creditDecisionRepository.findTopByApplication_IdOrderByDecidedAtDesc(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Credit decision not found"));
        return toResponse(decision, creditOfferRepository.findByDecision_Id(decision.getId()).orElse(null));
    }

    private void applyDecision(LoanApplication application, DecisionOutput output) {
        if (output == null || output.action() == null || output.policyVersion() == null || output.policyVersion().isBlank()) {
            throw new IllegalStateException("Decision policy returned an invalid result");
        }
        if (output.action() == DecisionAction.MANUAL_REVIEW) {
            workflowService.transition(application, LoanApplicationStatus.MANUAL_REVIEW, null);
            return;
        }
        if (output.decisionType() == null) {
            throw new IllegalStateException("Final decision type is required");
        }
        Instant decidedAt = Instant.now();
        CreditDecision decision = creditDecisionRepository.save(new CreditDecision(
                application, output.decisionType(), output.reason(), null, decidedAt, output.policyVersion()
        ));
        if (output.action() == DecisionAction.OFFER) {
            if (output.offerTerms() == null) {
                throw new IllegalStateException("Offer terms are required");
            }
            CreditOffer offer = creditOfferRepository.save(new CreditOffer(
                    decision,
                    output.offerTerms().amount(),
                    output.offerTerms().termMonths(),
                    output.offerTerms().interestRate(),
                    CreditOfferStatus.OFFERED,
                    decidedAt.plus(offerValidity)
            ));
            workflowService.transition(application, LoanApplicationStatus.OFFERED, null);
            workflowJobService.enqueueOfferExpiration(application, offer.getExpiresAt());
            return;
        }
        if (output.action() == DecisionAction.REJECT) {
            workflowService.transition(application, LoanApplicationStatus.REJECTED, null);
            return;
        }
        throw new IllegalStateException("Unsupported decision action");
    }

    private CreditDecisionResponse toResponse(CreditDecision decision, CreditOffer offer) {
        return new CreditDecisionResponse(
                decision.getId(),
                decision.getDecisionType(),
                decision.getReason(),
                decision.getDecidedAt(),
                decision.getPolicyVersion(),
                offer == null ? null : new CreditOfferResponse(
                        offer.getId(),
                        offer.getAmount(),
                        offer.getTermMonths(),
                        offer.getInterestRate(),
                        offer.getStatus(),
                        offer.getExpiresAt()
                )
        );
    }
}
