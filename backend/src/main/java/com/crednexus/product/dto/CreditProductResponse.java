package com.crednexus.product.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record CreditProductResponse(
        UUID id,
        String name,
        BigDecimal minAmount,
        BigDecimal maxAmount,
        Integer minTermMonths,
        Integer maxTermMonths,
        BigDecimal baseRate,
        boolean active
) {
}
