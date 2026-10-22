package com.crednexus.product.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record UpdateCreditProductRequest(
        @Size(min = 1, max = 255) String name,
        @DecimalMin("0.01") @Digits(integer = 17, fraction = 2) BigDecimal minAmount,
        @DecimalMin("0.01") @Digits(integer = 17, fraction = 2) BigDecimal maxAmount,
        @Min(1) Integer minTermMonths,
        @Min(1) Integer maxTermMonths,
        @DecimalMin("0.00") @Digits(integer = 3, fraction = 2) BigDecimal baseRate,
        Boolean active
) {
}
