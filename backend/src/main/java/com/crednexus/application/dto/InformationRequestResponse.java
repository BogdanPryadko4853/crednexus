package com.crednexus.application.dto;

import com.crednexus.application.entity.InformationRequestStatus;
import java.time.Instant;
import java.util.UUID;

public record InformationRequestResponse(UUID id, String question, InformationRequestStatus status, String answer,
                                         Instant answeredAt, String requirementCode, boolean requiresDocument) {
}
