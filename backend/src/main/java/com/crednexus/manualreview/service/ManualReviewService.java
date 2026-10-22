package com.crednexus.manualreview.service;

import com.crednexus.application.entity.InformationRequest;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.InformationRequestRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.application.repository.ApplicationStatusHistoryRepository;
import com.crednexus.application.repository.DocumentRepository;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.dto.ApplicationStatusHistoryResponse;
import com.crednexus.application.dto.DocumentResponse;
import com.crednexus.application.dto.FinancialSnapshotResponse;
import com.crednexus.application.dto.InformationRequestResponse;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.decision.dto.CreditDecisionResponse;
import com.crednexus.decision.dto.CreditOfferResponse;
import com.crednexus.decision.entity.CreditDecision;
import com.crednexus.decision.entity.CreditOffer;
import com.crednexus.decision.entity.CreditOfferStatus;
import com.crednexus.decision.entity.DecisionType;
import com.crednexus.decision.repository.CreditDecisionRepository;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.manualreview.dto.CreateInformationRequest;
import com.crednexus.manualreview.dto.ManualDecisionAction;
import com.crednexus.manualreview.dto.ManualDecisionRequest;
import com.crednexus.manualreview.dto.ManualReviewApplicationResponse;
import com.crednexus.manualreview.dto.ManualReviewDetailsResponse;
import com.crednexus.scoring.repository.ScoringResultRepository;
import com.crednexus.verification.repository.VerificationResultRepository;
import com.crednexus.verification.dto.VerificationResultResponse;
import com.crednexus.workflow.service.WorkflowJobService;
import com.crednexus.workflow.service.WorkflowService;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ManualReviewService {
    private final LoanApplicationRepository applicationRepository;
    private final InformationRequestRepository informationRequestRepository;
    private final CreditDecisionRepository decisionRepository;
    private final CreditOfferRepository offerRepository;
    private final CurrentUserProvider currentUserProvider;
    private final WorkflowService workflowService;
    private final WorkflowJobService workflowJobService;
    private final Duration offerValidity;
    private final FinancialSnapshotRepository financialSnapshotRepository;
    private final VerificationResultRepository verificationResultRepository;
    private final ScoringResultRepository scoringResultRepository;
    private final DocumentRepository documentRepository;
    private final ApplicationStatusHistoryRepository statusHistoryRepository;

    public ManualReviewService(LoanApplicationRepository applicationRepository,
                               InformationRequestRepository informationRequestRepository,
                               CreditDecisionRepository decisionRepository, CreditOfferRepository offerRepository,
                               CurrentUserProvider currentUserProvider, WorkflowService workflowService,
                               WorkflowJobService workflowJobService,
                               @Value("${decision.offer-validity:P7D}") Duration offerValidity,
                               FinancialSnapshotRepository financialSnapshotRepository,
                               VerificationResultRepository verificationResultRepository,
                               ScoringResultRepository scoringResultRepository, DocumentRepository documentRepository,
                               ApplicationStatusHistoryRepository statusHistoryRepository) {
        this.applicationRepository = applicationRepository;
        this.informationRequestRepository = informationRequestRepository;
        this.decisionRepository = decisionRepository;
        this.offerRepository = offerRepository;
        this.currentUserProvider = currentUserProvider;
        this.workflowService = workflowService;
        this.workflowJobService = workflowJobService;
        this.offerValidity = offerValidity;
        this.financialSnapshotRepository = financialSnapshotRepository;
        this.verificationResultRepository = verificationResultRepository;
        this.scoringResultRepository = scoringResultRepository;
        this.documentRepository = documentRepository;
        this.statusHistoryRepository = statusHistoryRepository;
    }

    @Transactional(readOnly = true)
    public List<ManualReviewApplicationResponse> getQueue() {
        return applicationRepository.findAllByStatusOrderByUpdatedAtAsc(LoanApplicationStatus.MANUAL_REVIEW).stream()
                .map(this::toApplicationResponse).toList();
    }

    @Transactional(readOnly = true)
    public ManualReviewApplicationResponse getApplication(UUID applicationId) {
        return toApplicationResponse(applicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found")));
    }

    @Transactional(readOnly = true)
    public ManualReviewDetailsResponse getDetails(UUID applicationId) {
        LoanApplication application = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        FinancialSnapshotResponse snapshot = financialSnapshotRepository.findByApplication_Id(applicationId).map(value ->
                new FinancialSnapshotResponse(value.getId(), applicationId, value.getAnnualRevenue(), value.getAnnualExpenses(),
                        value.getExistingDebt(), value.getMonthlyPayments(), value.getEmployeeCount(), value.getPeriod())).orElse(null);
        var scoring = scoringResultRepository.findTopByApplication_IdOrderByCalculatedAtDesc(applicationId).map(value ->
                new ManualReviewDetailsResponse.ScoringDetails(value.getScore(), value.getRiskLevel(), value.getFactors(),
                        value.getModelVersion(), value.getCalculatedAt())).orElse(null);
        List<VerificationResultResponse> verifications = verificationResultRepository.findAllByApplication_IdOrderByCheckedAtAsc(applicationId)
                .stream().map(value -> new VerificationResultResponse(value.getId(), value.getType(), value.getStatus(), value.getSource(),
                        value.getPayload(), value.getCheckedAt())).toList();
        List<DocumentResponse> documents = documentRepository.findAllByApplication_IdOrderByCreatedAtDesc(applicationId).stream()
                .map(value -> new DocumentResponse(value.getId(), value.getDocumentType(), value.getFileName(), value.getContentType(),
                        value.getSizeBytes(), value.getStatus(), value.getCreatedAt(), value.getInformationRequest() == null ? null : value.getInformationRequest().getId())).toList();
        List<InformationRequestResponse> requests = informationRequestRepository.findAllByApplication_IdOrderByIdDesc(applicationId).stream()
                .map(value -> new InformationRequestResponse(value.getId(), value.getQuestion(), value.getStatus(), value.getAnswer(), value.getAnsweredAt(),
                        value.getRequirementCode(), value.isRequiresDocument())).toList();
        List<ApplicationStatusHistoryResponse> history = statusHistoryRepository.findAllByApplication_IdOrderByOccurredAtAsc(applicationId).stream()
                .map(value -> new ApplicationStatusHistoryResponse(value.getId(), value.getFromStatus(), value.getToStatus(), value.getOccurredAt(),
                        value.getReason(), value.getActor() == null ? null : value.getActor().getId(), value.getActor() == null ? null : value.getActor().getFullName())).toList();
        List<CreditDecisionResponse> decisions = decisionRepository.findAllByApplication_IdOrderByDecidedAtDesc(applicationId).stream()
                .map(value -> response(value, offerRepository.findByDecision_Id(value.getId()).orElse(null))).toList();
        return new ManualReviewDetailsResponse(toApplicationResponse(application),
                new ManualReviewDetailsResponse.CompanyDetails(application.getCompany().getName(), application.getCompany().getInn(),
                        application.getCompany().getOgrnOrOgrnip(), application.getCompany().getLegalForm(), application.getCompany().getStatus()),
                snapshot, verifications, scoring, documents, requests, history, decisions);
    }

    @Transactional
    public CreditDecisionResponse decide(UUID applicationId, ManualDecisionRequest request) {
        LoanApplication application = applicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        if (application.getStatus() != LoanApplicationStatus.MANUAL_REVIEW) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Loan application is not under manual review");
        }
        User employee = currentUserProvider.getCurrentUser();
        Instant now = Instant.now();
        if (request.action() == ManualDecisionAction.REJECT) {
            CreditDecision decision = decisionRepository.save(new CreditDecision(application, DecisionType.REJECTED,
                    request.reason(), employee, now, "manual-v1"));
            workflowService.transition(application, LoanApplicationStatus.REJECTED, employee, request.reason());
            return response(decision, null);
        }
        Terms terms = terms(application, request);
        DecisionType type = request.action() == ManualDecisionAction.APPROVE ? DecisionType.APPROVED : DecisionType.COUNTER_OFFER;
        CreditDecision decision = decisionRepository.save(new CreditDecision(application, type, request.reason(), employee, now, "manual-v1"));
        CreditOffer offer = offerRepository.save(new CreditOffer(decision, terms.amount(), terms.termMonths(), terms.interestRate(),
                CreditOfferStatus.OFFERED, now.plus(offerValidity)));
        workflowService.transition(application, LoanApplicationStatus.OFFERED, employee, request.reason());
        workflowJobService.enqueueOfferExpiration(application, offer.getExpiresAt());
        return response(decision, offer);
    }

    @Transactional
    public void requestInformation(UUID applicationId, CreateInformationRequest request) {
        LoanApplication application = applicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        if (application.getStatus() != LoanApplicationStatus.MANUAL_REVIEW) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Loan application is not under manual review");
        }
        User employee = currentUserProvider.getCurrentUser();
        informationRequestRepository.save(new InformationRequest(application, request.question(), employee));
        workflowService.transition(application, LoanApplicationStatus.NEEDS_INFO, employee, request.question());
    }

    private Terms terms(LoanApplication application, ManualDecisionRequest request) {
        BigDecimal amount = request.action() == ManualDecisionAction.APPROVE ? application.getRequestedAmount() : request.amount();
        Integer term = request.action() == ManualDecisionAction.APPROVE ? application.getTermMonths() : request.termMonths();
        BigDecimal rate = request.action() == ManualDecisionAction.APPROVE ? application.getProduct().getBaseRate() : request.interestRate();
        if (!application.getProduct().isActive() || amount == null || term == null || rate == null || rate.signum() <= 0
                || amount.compareTo(application.getProduct().getMinAmount()) < 0 || amount.compareTo(application.getProduct().getMaxAmount()) > 0
                || term < application.getProduct().getMinTermMonths() || term > application.getProduct().getMaxTermMonths()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Offer terms do not match product limits");
        }
        return new Terms(amount, term, rate);
    }

    private CreditDecisionResponse response(CreditDecision decision, CreditOffer offer) {
        return new CreditDecisionResponse(decision.getId(), decision.getDecisionType(), decision.getReason(), decision.getDecidedAt(), decision.getPolicyVersion(),
                offer == null ? null : new CreditOfferResponse(offer.getId(), offer.getAmount(), offer.getTermMonths(), offer.getInterestRate(), offer.getStatus(), offer.getExpiresAt()));
    }

    private ManualReviewApplicationResponse toApplicationResponse(LoanApplication application) {
        return new ManualReviewApplicationResponse(application.getId(), application.getCompany().getName(), application.getRequestedAmount(),
                application.getTermMonths(), application.getPurpose());
    }

    private record Terms(BigDecimal amount, Integer termMonths, BigDecimal interestRate) { }
}
