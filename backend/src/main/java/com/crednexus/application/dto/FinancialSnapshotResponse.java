package com.crednexus.application.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record FinancialSnapshotResponse(
        UUID id,
        UUID applicationId,
        BigDecimal annualRevenue,
        BigDecimal annualExpenses,
        BigDecimal existingDebt,
        BigDecimal monthlyPayments,
        Integer employeeCount,
        String period
) {
}
