package com.crednexus.product.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record CreateCreditProductRequest(
        @NotBlank @Size(max = 255) String name,
        @NotNull @DecimalMin("0.01") @Digits(integer = 17, fraction = 2) BigDecimal minAmount,
        @NotNull @DecimalMin("0.01") @Digits(integer = 17, fraction = 2) BigDecimal maxAmount,
        @NotNull @Min(1) Integer minTermMonths,
        @NotNull @Min(1) Integer maxTermMonths,
        @NotNull @DecimalMin("0.00") @Digits(integer = 3, fraction = 2) BigDecimal baseRate,
        boolean active
) {
}
