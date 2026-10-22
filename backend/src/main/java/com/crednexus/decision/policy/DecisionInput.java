package com.crednexus.decision.policy;

import com.crednexus.scoring.entity.RiskLevel;
import java.math.BigDecimal;
import java.util.UUID;

public record DecisionInput(
        UUID applicationId,
        BigDecimal requestedAmount,
        Integer requestedTermMonths,
        BigDecimal baseRate,
        Integer score,
        RiskLevel riskLevel
) {
}
