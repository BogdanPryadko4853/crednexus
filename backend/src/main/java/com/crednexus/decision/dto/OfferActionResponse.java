package com.crednexus.decision.dto;

import com.crednexus.application.entity.LoanApplicationStatus;

public record OfferActionResponse(LoanApplicationStatus applicationStatus, CreditOfferResponse offer) {
}
