package com.crednexus.application.dto;

import com.crednexus.application.entity.DocumentStatus;
import com.crednexus.application.entity.DocumentType;
import java.time.Instant;
import java.util.UUID;

public record DocumentResponse(UUID id, DocumentType documentType, String fileName, String contentType,
                               long sizeBytes, DocumentStatus status, Instant createdAt, UUID informationRequestId) { }
