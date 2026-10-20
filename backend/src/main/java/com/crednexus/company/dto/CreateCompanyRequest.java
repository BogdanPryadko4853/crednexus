package com.crednexus.company.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateCompanyRequest(
        @NotBlank @Pattern(regexp = "\\d{10}(\\d{2})?") String inn,
        @NotBlank @Pattern(regexp = "\\d{13}|\\d{15}") String ogrnOrOgrnip,
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 255) String legalForm,
        @NotBlank @Size(max = 255) String status
) {
}
