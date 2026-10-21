package com.crednexus.decision.dto;

import com.crednexus.decision.entity.DecisionType;
import java.time.Instant;
import java.util.UUID;

public record CreditDecisionResponse(
        UUID id,
        DecisionType decisionType,
        String reason,
        Instant decidedAt,
        String policyVersion,
        CreditOfferResponse offer
) {
}
