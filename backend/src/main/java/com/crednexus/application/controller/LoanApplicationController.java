package com.crednexus.application.controller;

import com.crednexus.application.dto.CreateLoanApplicationRequest;
import com.crednexus.application.dto.LoanApplicationResponse;
import com.crednexus.application.dto.UpdateLoanApplicationRequest;
import com.crednexus.application.service.LoanApplicationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class LoanApplicationController {

    private final LoanApplicationService loanApplicationService;

    public LoanApplicationController(LoanApplicationService loanApplicationService) {
        this.loanApplicationService = loanApplicationService;
    }

    @PostMapping("/companies/{companyId}/loan-applications")
    @ResponseStatus(HttpStatus.CREATED)
    public LoanApplicationResponse createDraft(
            @PathVariable UUID companyId,
            @Valid @RequestBody CreateLoanApplicationRequest request
    ) {
        return loanApplicationService.createDraft(companyId, request);
    }

    @GetMapping("/loan-applications")
    public List<LoanApplicationResponse> getCurrentUserApplications() {
        return loanApplicationService.getCurrentUserApplications();
    }

    @GetMapping("/loan-applications/{applicationId}")
    public LoanApplicationResponse getApplication(@PathVariable UUID applicationId) {
        return loanApplicationService.getApplication(applicationId);
    }

    @PatchMapping("/loan-applications/{applicationId}")
    public LoanApplicationResponse updateDraft(
            @PathVariable UUID applicationId,
            @Valid @RequestBody UpdateLoanApplicationRequest request
    ) {
        return loanApplicationService.updateDraft(applicationId, request);
    }
}
