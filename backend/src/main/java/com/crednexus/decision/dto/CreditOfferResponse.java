package com.crednexus.decision.dto;

import com.crednexus.decision.entity.CreditOfferStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record CreditOfferResponse(
        UUID id,
        BigDecimal amount,
        Integer termMonths,
        BigDecimal interestRate,
        CreditOfferStatus status,
        Instant expiresAt
) {
}
