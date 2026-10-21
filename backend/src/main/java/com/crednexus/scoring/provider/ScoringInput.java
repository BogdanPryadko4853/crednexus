package com.crednexus.scoring.provider;

import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

public record ScoringInput(
        UUID applicationId,
        BigDecimal requestedAmount,
        Integer termMonths,
        FinancialData financialData,
        Map<VerificationType, VerificationData> verifications
) {

    public record FinancialData(
            BigDecimal annualRevenue,
            BigDecimal annualExpenses,
            BigDecimal existingDebt,
            BigDecimal monthlyPayments,
            Integer employeeCount,
            String period
    ) {
    }

    public record VerificationData(VerificationStatus status, Map<String, Object> payload) {
    }
}
