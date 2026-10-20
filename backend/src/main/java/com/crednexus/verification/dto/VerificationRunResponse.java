package com.crednexus.verification.dto;

import com.crednexus.application.entity.LoanApplicationStatus;
import java.util.List;
import java.util.UUID;

public record VerificationRunResponse(
        UUID applicationId,
        LoanApplicationStatus applicationStatus,
        List<VerificationResultResponse> results
) {
}
