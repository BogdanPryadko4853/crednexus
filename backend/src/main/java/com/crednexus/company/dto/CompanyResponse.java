package com.crednexus.company.dto;

import com.crednexus.company.entity.CompanyMemberRole;
import java.util.UUID;

public record CompanyResponse(
        UUID id,
        String inn,
        String ogrnOrOgrnip,
        String name,
        String legalForm,
        String status,
        CompanyMemberRole currentUserRole,
        boolean currentUserCanApply
) {
}
