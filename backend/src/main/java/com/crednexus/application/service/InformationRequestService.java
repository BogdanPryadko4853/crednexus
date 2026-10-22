package com.crednexus.application.service;

import com.crednexus.application.dto.AnswerInformationRequest;
import com.crednexus.application.dto.InformationRequestResponse;
import com.crednexus.application.entity.InformationRequest;
import com.crednexus.application.entity.InformationRequestStatus;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.InformationRequestRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.workflow.service.WorkflowJobService;
import com.crednexus.workflow.service.WorkflowService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class InformationRequestService {
    private final LoanApplicationRepository applicationRepository;
    private final InformationRequestRepository requestRepository;
    private final CurrentUserProvider currentUserProvider;
    private final CompanyMemberRepository memberRepository;
    private final WorkflowService workflowService;
    private final WorkflowJobService jobService;

    public InformationRequestService(LoanApplicationRepository applicationRepository, InformationRequestRepository requestRepository,
                                     CurrentUserProvider currentUserProvider, CompanyMemberRepository memberRepository,
                                     WorkflowService workflowService, WorkflowJobService jobService) {
        this.applicationRepository = applicationRepository;
        this.requestRepository = requestRepository;
        this.currentUserProvider = currentUserProvider;
        this.memberRepository = memberRepository;
        this.workflowService = workflowService;
        this.jobService = jobService;
    }

    @Transactional(readOnly = true)
    public List<InformationRequestResponse> getAll(UUID applicationId) {
        requireAccess(application(applicationId), false);
        return requestRepository.findAllByApplication_IdOrderByIdDesc(applicationId).stream().map(this::response).toList();
    }

    @Transactional
    public InformationRequestResponse answer(UUID applicationId, UUID requestId, AnswerInformationRequest answer) {
        LoanApplication application = applicationRepository.findByIdForUpdate(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        User user = requireAccess(application, true);
        if (application.getStatus() != LoanApplicationStatus.NEEDS_INFO) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Loan application does not need information");
        }
        InformationRequest request = requestRepository.findByIdAndApplication_Id(requestId, applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Information request not found"));
        if (request.getStatus() == InformationRequestStatus.ANSWERED) {
            if (request.getAnswer().equals(answer.answer())) return response(request);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Information request has already been answered");
        }
        if (request.getStatus() != InformationRequestStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Information request is not open");
        }
        if (request.isRequiresDocument()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A document is required for this information request");
        }
        if (answer.answer() == null || answer.answer().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Information request answer must not be blank");
        }
        request.answer(answer.answer(), Instant.now());
        if (!requestRepository.existsByApplication_IdAndStatus(applicationId, InformationRequestStatus.OPEN)) {
            workflowService.transition(application, LoanApplicationStatus.SUBMITTED, user, "Клиент ответил на все запросы уточнений");
            jobService.enqueueVerification(application);
        }
        return response(request);
    }

    private LoanApplication application(UUID applicationId) {
        return applicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
    }

    private User requireAccess(LoanApplication application, boolean canApply) {
        User user = currentUserProvider.getCurrentUser();
        return memberRepository.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId())
                .filter(member -> member.isActive() && (!canApply || member.isCanApply()))
                .map(member -> user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company authority is denied"));
    }

    private InformationRequestResponse response(InformationRequest request) {
        return new InformationRequestResponse(request.getId(), request.getQuestion(), request.getStatus(), request.getAnswer(), request.getAnsweredAt(),
                request.getRequirementCode(), request.isRequiresDocument());
    }
}
