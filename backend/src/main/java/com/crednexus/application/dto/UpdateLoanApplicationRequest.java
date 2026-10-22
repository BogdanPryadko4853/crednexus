package com.crednexus.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;

public record UpdateLoanApplicationRequest(
        UUID productId,
        @DecimalMin("0.01") @Digits(integer = 17, fraction = 2) BigDecimal requestedAmount,
        @Min(1) Integer termMonths,
        @Size(min = 1, max = 255) String purpose
) {
}
