package com.crednexus.manualreview.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateInformationRequest(@NotBlank String question) {
}
