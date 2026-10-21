package com.crednexus.manualreview.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record ManualReviewApplicationResponse(UUID id, String companyName, BigDecimal requestedAmount,
                                              Integer requestedTermMonths, String purpose) {
}
