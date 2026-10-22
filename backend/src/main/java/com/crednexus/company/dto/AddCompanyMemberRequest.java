package com.crednexus.company.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record AddCompanyMemberRequest(
        @NotNull UUID userId,
        @NotBlank @Size(max = 255) String position,
        boolean canApply
) {
}
