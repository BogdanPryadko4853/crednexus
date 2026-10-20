package com.crednexus.verification.dto;

import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record VerificationResultResponse(
        UUID id,
        VerificationType type,
        VerificationStatus status,
        String source,
        Map<String, Object> payload,
        Instant checkedAt
) {
}
