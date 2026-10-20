package com.crednexus.verification.mock;

import com.crednexus.verification.entity.VerificationStatus;
import java.util.Map;

public record MockVerificationOutcome(VerificationStatus status, Map<String, Object> payload) {
}
