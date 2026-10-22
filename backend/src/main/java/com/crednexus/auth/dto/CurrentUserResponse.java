package com.crednexus.auth.dto;

import java.util.Set;
import java.util.UUID;

public record CurrentUserResponse(
        UUID id,
        String keycloakId,
        String email,
        String fullName,
        Set<String> roles
) {
}
