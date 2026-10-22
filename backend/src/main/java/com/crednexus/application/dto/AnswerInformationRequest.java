package com.crednexus.application.dto;

import jakarta.validation.constraints.NotBlank;

public record AnswerInformationRequest(@NotBlank String answer) {
}
