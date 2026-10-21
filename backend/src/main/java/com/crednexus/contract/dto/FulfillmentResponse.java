package com.crednexus.contract.dto;

import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.contract.entity.DisbursementStatus;
import com.crednexus.contract.entity.LoanAgreementStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record FulfillmentResponse(
        LoanApplicationStatus applicationStatus,
        UUID agreementId,
        String contractNumber,
        LoanAgreementStatus agreementStatus,
        Instant signedAt,
        UUID disbursementId,
        BigDecimal disbursementAmount,
        DisbursementStatus disbursementStatus,
        Instant disbursedAt
) {
}
