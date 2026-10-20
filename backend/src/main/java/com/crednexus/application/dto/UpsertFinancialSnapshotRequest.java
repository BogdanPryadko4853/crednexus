package com.crednexus.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record UpsertFinancialSnapshotRequest(
        @NotNull @DecimalMin("0.00") @Digits(integer = 17, fraction = 2) BigDecimal annualRevenue,
        @NotNull @DecimalMin("0.00") @Digits(integer = 17, fraction = 2) BigDecimal annualExpenses,
        @NotNull @DecimalMin("0.00") @Digits(integer = 17, fraction = 2) BigDecimal existingDebt,
        @NotNull @DecimalMin("0.00") @Digits(integer = 17, fraction = 2) BigDecimal monthlyPayments,
        @NotNull @Min(1) Integer employeeCount,
        @NotBlank @Size(max = 255) String period
) {
}
