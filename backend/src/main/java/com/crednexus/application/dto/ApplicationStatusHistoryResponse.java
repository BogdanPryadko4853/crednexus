package com.crednexus.application.dto;

import com.crednexus.application.entity.LoanApplicationStatus;
import java.time.Instant;
import java.util.UUID;

public record ApplicationStatusHistoryResponse(UUID id, LoanApplicationStatus fromStatus, LoanApplicationStatus toStatus,
                                               Instant occurredAt, String reason, UUID actorId, String actorName) { }
