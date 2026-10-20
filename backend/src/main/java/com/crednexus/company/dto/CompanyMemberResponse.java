package com.crednexus.company.dto;

import com.crednexus.company.entity.CompanyMemberRole;
import java.util.UUID;

public record CompanyMemberResponse(
        UUID id,
        UUID userId,
        String email,
        String fullName,
        String position,
        boolean canApply,
        boolean active,
        CompanyMemberRole role
) {
}
