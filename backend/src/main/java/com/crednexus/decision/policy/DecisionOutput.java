package com.crednexus.decision.policy;

import com.crednexus.decision.entity.DecisionType;
import java.math.BigDecimal;

public record DecisionOutput(
        DecisionAction action,
        DecisionType decisionType,
        String reason,
        OfferTerms offerTerms,
        String policyVersion
) {

    public record OfferTerms(BigDecimal amount, Integer termMonths, BigDecimal interestRate) {
    }
}
