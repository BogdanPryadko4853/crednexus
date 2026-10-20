package com.crednexus.application.dto;

import com.crednexus.application.entity.LoanApplicationStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record LoanApplicationResponse(
        UUID id,
        UUID companyId,
        UUID productId,
        UUID createdById,
        BigDecimal requestedAmount,
        Integer termMonths,
        String purpose,
        LoanApplicationStatus status,
        Instant createdAt,
        Instant updatedAt,
        Integer version
) {
}
