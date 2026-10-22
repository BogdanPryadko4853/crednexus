package com.crednexus.manualreview.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record ManualDecisionRequest(
        @NotNull ManualDecisionAction action,
        @NotBlank String reason,
        BigDecimal amount,
        Integer termMonths,
        BigDecimal interestRate
) {
}
